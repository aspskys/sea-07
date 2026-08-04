import "server-only";

import fs from "node:fs";
import path from "node:path";
import {
  Client,
  sdkVersion,
  withPollInterval,
  withPollTimeout,
} from "sea_sdk_js";
import {
  loadSeaInfraMultimodalConfig,
  resolveSeaGatewayRoot,
} from "./config";

export type ModalTaskRecord = {
  taskId: string;
  model: string;
  capability: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  /** Business correlation id (session/scene/etc). */
  businessRef?: string;
  errorCode?: string | number;
  errorMessage?: string;
  /** Output content URLs — not auto-exposed to clients. */
  resultUrls?: string[];
  precharge?: { status?: string; cost?: unknown; reason?: string };
};

export type ModalSubmitInput = {
  capability: string;
  /** Prompt / edit instruction / TTS text. */
  prompt: string;
  /** Required for alibaba_qwen_image_2_0 (image-to-image). http(s) URL only. */
  imageUrl?: string;
  /**
   * TTS voice name. Mutually exclusive with voiceId.
   * - mureka_tts: Ethan|Victoria|Jake|Luna|Emma
   * - alibaba_qwen_audio_3_tts_plus: platform NLS voice id (ask SeaInfra for allowlist)
   */
  voice?: string;
  /** TTS custom voice_id — mutually exclusive with voice. */
  voiceId?: string;
  businessRef?: string;
  /** Optional size like 1024*1024 for models that accept it. */
  size?: string;
  n?: number;
  pollTimeoutMs?: number;
  pollIntervalMs?: number;
  /** When true, call precharge with the same body (estimate may be null). */
  precharge?: boolean;
};

export type ModalSubmitResult = {
  taskId: string;
  status: string;
  model: string;
  capability: string;
  resultUrls: string[];
  record: ModalTaskRecord;
  precharge?: ModalTaskRecord["precharge"];
};

function tasksDir(): string {
  return path.join(process.cwd(), ".agents", "seainfra", "tasks");
}

function taskPath(taskId: string): string {
  // task ids are gateway-generated alphanumerics; still sanitize path segments
  const safe = taskId.replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(tasksDir(), `${safe}.json`);
}

export function persistModalTask(record: ModalTaskRecord): void {
  fs.mkdirSync(tasksDir(), { recursive: true });
  fs.writeFileSync(taskPath(record.taskId), JSON.stringify(record, null, 2) + "\n");
}

export function loadModalTask(taskId: string): ModalTaskRecord | null {
  const file = taskPath(taskId);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as ModalTaskRecord;
  } catch {
    return null;
  }
}

export function multimodalSdkVersion(): string {
  return typeof sdkVersion === "string" ? sdkVersion : "unknown";
}

function createModalClient(timeoutMs = 120_000): Client {
  const cfg = loadSeaInfraMultimodalConfig();
  if (!cfg?.base_url || !cfg?.api_key) {
    throw new Error("multimodal base_url/api_key missing in seainfra config");
  }
  return new Client({
    apiKey: cfg.api_key,
    baseURL: resolveSeaGatewayRoot(cfg.base_url),
    timeout: timeoutMs,
  });
}

export function resolveModelForCapability(capability: string): string {
  const cfg = loadSeaInfraMultimodalConfig();
  const model = cfg?.models?.[capability];
  if (!model) {
    throw new Error(`No model mapped for capability "${capability}"`);
  }
  return model;
}

/**
 * Build task body from live getModelSkill schema evidence.
 * Only known model shapes are constructed — never invent params.
 */
export function buildModalTaskBody(input: {
  model: string;
  capability: string;
  prompt: string;
  imageUrl?: string;
  voice?: ModalSubmitInput["voice"];
  voiceId?: string;
  size?: string;
  n?: number;
}): Record<string, unknown> {
  const model = input.model;
  const prompt = input.prompt.trim();
  if (!prompt) throw new Error("prompt is required");

  // TTS models — text-to-audio
  if (
    input.capability === "tts" ||
    model === "mureka_tts" ||
    model === "alibaba_qwen_audio_3_tts_plus"
  ) {
    if (prompt.length > 500) {
      throw new Error(`${model} text max 500 characters`);
    }
    if (input.voice && input.voiceId) {
      throw new Error(`${model}: voice and voice_id are mutually exclusive`);
    }

    // mureka_tts: built-in Ethan|Victoria|Jake|Luna|Emma or voice_id
    if (model === "mureka_tts") {
      const params: Record<string, string> = { text: prompt };
      if (input.voiceId) params.voice_id = input.voiceId;
      else params.voice = input.voice ?? "Ethan";
      return {
        model,
        dash_scope: true,
        moderation: true,
        input: [{ params }],
        metadata: {},
      };
    }

    // alibaba_qwen_audio_3_tts_plus: gateway requires NLS voice string.
    // getModelSkill is 404 on this env; voice list must come from platform.
    // Default tries a common NLS id; override via voice / voiceId.
    if (model === "alibaba_qwen_audio_3_tts_plus") {
      const voice = input.voiceId || input.voice || "xiaoyun";
      return {
        model,
        dash_scope: true,
        moderation: true,
        input: [{ params: { text: prompt, voice } }],
        metadata: {},
      };
    }

    throw new Error(`No TTS schema builder for model "${model}"`);
  }

  // alibaba_qwen_image_2_0 — image-to-image (schema: messages content text+image)
  if (model === "alibaba_qwen_image_2_0") {
    if (!input.imageUrl || !/^https?:\/\//i.test(input.imageUrl)) {
      throw new Error(
        "alibaba_qwen_image_2_0 requires an http(s) imageUrl (image-to-image)",
      );
    }
    const content: Array<Record<string, string>> = [
      { image: input.imageUrl },
      { text: prompt },
    ];
    return {
      model,
      dash_scope: true,
      moderation: true,
      input: [
        {
          params: {
            input: {
              messages: [{ role: "user", content }],
            },
            parameters: {
              n: input.n ?? 1,
              watermark: false,
              ...(input.size ? { size: input.size } : {}),
            },
          },
        },
      ],
      metadata: {},
    };
  }

  // alibaba_qianwen_image — text-to-image (optional companion if configured)
  if (model === "alibaba_qianwen_image") {
    return {
      model,
      dash_scope: true,
      moderation: true,
      input: [
        {
          params: {
            input: {
              messages: [
                {
                  role: "user",
                  content: [{ text: prompt }],
                },
              ],
            },
            parameters: {
              size: input.size ?? "1024*1024",
              n: input.n ?? 1,
              watermark: false,
              prompt_extend: false,
            },
          },
        },
      ],
      metadata: {},
    };
  }

  throw new Error(
    `No schema builder for model "${model}". Re-read getModelSkill and extend builder.`,
  );
}

/** @deprecated use buildModalTaskBody */
export function buildImageGenerateBody(input: {
  model: string;
  prompt: string;
  imageUrl?: string;
  size?: string;
  n?: number;
}): Record<string, unknown> {
  return buildModalTaskBody({
    model: input.model,
    capability: "image_generate",
    prompt: input.prompt,
    imageUrl: input.imageUrl,
    size: input.size,
    n: input.n,
  });
}

function extractResultUrls(output: unknown): string[] {
  const urls: string[] = [];
  if (!Array.isArray(output)) return urls;
  for (const item of output) {
    const content = (item as { content?: unknown })?.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      const p = part as { type?: string; url?: string };
      if (p?.type === "image" || p?.type === "audio" || p?.type === "video") {
        if (typeof p.url === "string" && p.url) urls.push(p.url);
      } else if (typeof p?.url === "string" && p.url) {
        urls.push(p.url);
      }
    }
  }
  return urls;
}

function logModal(
  event: string,
  fields: Record<string, string | number | boolean | undefined>,
): void {
  const parts = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  console.log(`[seainfra-modal] ${event} ${parts}`);
}

/**
 * Create a modal task, persist task id immediately, optionally precharge,
 * then wait with bounded poll. Does not auto-retry failed billable tasks.
 */
export async function submitAndWaitModalTask(
  input: ModalSubmitInput,
): Promise<ModalSubmitResult> {
  const model = resolveModelForCapability(input.capability);
  const body = buildModalTaskBody({
    model,
    capability: input.capability,
    prompt: input.prompt,
    imageUrl: input.imageUrl,
    voice: input.voice,
    voiceId: input.voiceId,
    size: input.size,
    n: input.n,
  });

  const pollTimeoutMs = input.pollTimeoutMs ?? 180_000;
  const pollIntervalMs = input.pollIntervalMs ?? 2_000;
  const client = createModalClient(pollTimeoutMs + 30_000);

  let prechargeInfo: ModalTaskRecord["precharge"] | undefined;
  if (input.precharge) {
    try {
      const pre = await client.modal.precharge(body);
      const data = (pre as { data?: { cost?: unknown; reason?: string }; status?: string })
        ?.data;
      prechargeInfo = {
        status: (pre as { status?: string })?.status,
        cost: data?.cost ?? null,
        reason: data?.reason,
      };
      // Missing cost is an explicit state — never treat as zero.
      logModal("precharge", {
        model,
        status: prechargeInfo.status,
        has_cost: data?.cost != null,
        reason: data?.reason,
      });
    } catch (err) {
      prechargeInfo = {
        status: "error",
        reason: err instanceof Error ? err.message.slice(0, 120) : "precharge_failed",
      };
      logModal("precharge_error", { model, reason: prechargeInfo.reason });
    }
  }

  const created = await client.modal.create(body);
  const taskId = created.id;
  if (!taskId) throw new Error("modal create returned no task id");

  const now = new Date().toISOString();
  let record: ModalTaskRecord = {
    taskId,
    model,
    capability: input.capability,
    status: String(created.status ?? "created"),
    createdAt: now,
    updatedAt: now,
    businessRef: input.businessRef,
    precharge: prechargeInfo,
  };
  persistModalTask(record);
  logModal("created", { taskId, model, capability: input.capability });

  // Bounded wait — never auto-resubmit on failure.
  let final = created;
  try {
    final = await created.wait(
      withPollTimeout(pollTimeoutMs),
      withPollInterval(pollIntervalMs),
    );
  } catch (err) {
    // Refresh record from get for error details
    try {
      final = await client.modal.get(taskId);
    } catch {
      /* keep created */
    }
    const msg = err instanceof Error ? err.message : "wait_failed";
    record = {
      ...record,
      status: String(final.status ?? "failed"),
      updatedAt: new Date().toISOString(),
      errorMessage: msg.slice(0, 300),
      errorCode: final.error?.code,
      resultUrls: extractResultUrls(final.output),
    };
    persistModalTask(record);
    logModal("failed", {
      taskId,
      status: record.status,
      code: String(record.errorCode ?? ""),
    });
    throw err;
  }

  const status = String(final.status ?? "").toLowerCase();
  const resultUrls = extractResultUrls(final.output);
  record = {
    ...record,
    status: String(final.status ?? status),
    updatedAt: new Date().toISOString(),
    resultUrls,
    errorCode: final.error?.code,
    errorMessage: final.error?.message ?? final.error?.error_message,
  };
  persistModalTask(record);
  logModal("completed", {
    taskId,
    status: record.status,
    urls: resultUrls.length,
  });

  if (status === "failed") {
    throw new Error(
      `modal task failed task_id=${taskId} code=${record.errorCode ?? ""}`,
    );
  }

  return {
    taskId,
    status: record.status,
    model,
    capability: input.capability,
    resultUrls,
    record,
    precharge: prechargeInfo,
  };
}

/**
 * Resume a previously persisted task (after restart) via task id.
 * Does not create a new billable task.
 */
export async function resumeModalTask(
  taskId: string,
  opts?: { pollTimeoutMs?: number; pollIntervalMs?: number },
): Promise<ModalSubmitResult> {
  const existing = loadModalTask(taskId);
  const client = createModalClient((opts?.pollTimeoutMs ?? 180_000) + 30_000);
  let task = await client.modal.get(taskId);
  const st = String(task.status ?? "").toLowerCase();
  if (st !== "completed" && st !== "failed" && st !== "cancelled") {
    task = await client.modal.wait(
      taskId,
      withPollTimeout(opts?.pollTimeoutMs ?? 180_000),
      withPollInterval(opts?.pollIntervalMs ?? 2_000),
    );
  }
  const resultUrls = extractResultUrls(task.output);
  const record: ModalTaskRecord = {
    taskId,
    model: String(task.model ?? existing?.model ?? ""),
    capability: existing?.capability ?? "unknown",
    status: String(task.status ?? ""),
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    businessRef: existing?.businessRef,
    resultUrls,
    errorCode: task.error?.code,
    errorMessage: task.error?.message ?? task.error?.error_message,
    precharge: existing?.precharge,
  };
  persistModalTask(record);
  return {
    taskId,
    status: record.status,
    model: record.model,
    capability: record.capability,
    resultUrls,
    record,
    precharge: record.precharge,
  };
}

/** List catalog hits (server-side). */
export async function listModalCatalog(
  query?: string,
): Promise<Array<{ id: string; name?: string; tags?: string[] }>> {
  const client = createModalClient(60_000);
  const res = await client.modal.listModels(
    query ? { q: query, query, limit: 20 } : { limit: 20 },
  );
  const hits = res.hits ?? [];
  return hits.map((h) => ({
    id: String(h.id ?? h.name ?? ""),
    name: h.name != null ? String(h.name) : undefined,
    tags: Array.isArray(h.tags) ? h.tags.map(String) : undefined,
  }));
}
