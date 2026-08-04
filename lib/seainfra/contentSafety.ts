import "server-only";

import { Client, sdkVersion } from "sea_sdk_js";
import {
  loadSeaInfraContentSafetyConfig,
  resolveSeaGatewayRoot,
} from "./config";

/** Product decision after scan completion + policy. */
export type SafetyDecision = "allow" | "review" | "block" | "unavailable";

export type SafetyMethod =
  | "scanTextContent"
  | "scanText"
  | "scanImage"
  | "scanVisualStructuredTextFusion";

export type SafetyVerdict = {
  decision: SafetyDecision;
  method: SafetyMethod;
  /** Non-sensitive reason code for logs / client errors. */
  reasonCode: string;
  requestId?: string;
  /** Scan completed (method completion field passed). */
  completed: boolean;
  durationMs: number;
  /** Numeric risk when available (text level / image nsfw_level). */
  riskLevel?: number;
};

export type ContentSafetyPolicy = {
  /**
   * Text/image risk scale is 0–6 (SDK README). Scores >= this → block.
   * Default 4 = "高风险拦截".
   */
  blockAtLevel: number;
  /**
   * Scores in [reviewAtLevel, blockAtLevel) → review.
   * Default 2. Scores below review → allow.
   */
  reviewAtLevel: number;
  /** On timeout / 5xx / incomplete scan: fail-closed | fail-open | manual-review. */
  onUnavailable: "fail-closed" | "fail-open" | "manual-review";
};

const DEFAULT_POLICY: ContentSafetyPolicy = {
  blockAtLevel: 4,
  reviewAtLevel: 2,
  onUnavailable: "fail-closed",
};

/** Parse product policy string; keep defaults when unspecified. */
export function resolvePolicy(raw: string | null | undefined): ContentSafetyPolicy {
  const p = { ...DEFAULT_POLICY };
  if (!raw) return p;
  if (/fail-closed|超时\s*fail-closed/i.test(raw)) p.onUnavailable = "fail-closed";
  if (/fail-open/i.test(raw)) p.onUnavailable = "fail-open";
  if (/manual-review|人工复审/i.test(raw)) p.onUnavailable = "manual-review";
  // 高风险拦截 → keep blockAtLevel 4
  if (/高风险拦截/.test(raw)) p.blockAtLevel = 4;
  return p;
}

function present(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function mapUnavailable(
  policy: ContentSafetyPolicy,
  reasonCode: string,
  method: SafetyMethod,
  durationMs: number,
  requestId?: string,
): SafetyVerdict {
  const decision: SafetyDecision =
    policy.onUnavailable === "fail-open"
      ? "allow"
      : policy.onUnavailable === "manual-review"
        ? "review"
        : "block";
  return {
    decision,
    method,
    reasonCode,
    requestId,
    completed: false,
    durationMs,
  };
}

function decideFromLevel(
  level: number,
  policy: ContentSafetyPolicy,
  method: SafetyMethod,
  durationMs: number,
  requestId?: string,
): SafetyVerdict {
  let decision: SafetyDecision = "allow";
  let reasonCode = "risk_low";
  if (level >= policy.blockAtLevel) {
    decision = "block";
    reasonCode = "risk_high";
  } else if (level >= policy.reviewAtLevel) {
    decision = "review";
    reasonCode = "risk_medium";
  }
  return {
    decision,
    method,
    reasonCode,
    requestId,
    completed: true,
    durationMs,
    riskLevel: level,
  };
}

/** Safe log line — never include content, base64, or keys. */
export function logSafetyVerdict(verdict: SafetyVerdict): void {
  console.log(
    `[content-safety] method=${verdict.method} decision=${verdict.decision} ` +
      `completed=${verdict.completed} reason=${verdict.reasonCode} ` +
      `risk=${verdict.riskLevel ?? "-"} req=${verdict.requestId ?? "-"} ` +
      `ms=${verdict.durationMs}`,
  );
}

function createSeaClient(timeoutMs = 30_000): Client {
  const cfg = loadSeaInfraContentSafetyConfig();
  if (!cfg?.base_url || !cfg?.api_key) {
    throw new Error("content_safety base_url/api_key missing in seainfra config");
  }
  const root = resolveSeaGatewayRoot(cfg.base_url);
  return new Client({
    apiKey: cfg.api_key,
    baseURL: root,
    timeout: timeoutMs,
  });
}

export function contentSafetySdkVersion(): string {
  return typeof sdkVersion === "string" ? sdkVersion : "unknown";
}

/**
 * Short-text risk scan (level 0–6). Preferred for product policy that
 * needs severity (高风险拦截).
 */
export async function scanUserText(
  text: string,
  opts?: { policy?: ContentSafetyPolicy; timeoutMs?: number },
): Promise<SafetyVerdict> {
  const method: SafetyMethod = "scanTextContent";
  const policy = opts?.policy ?? resolvePolicy(
    loadSeaInfraContentSafetyConfig()?.policy,
  );
  const started = Date.now();
  const trimmed = text?.trim() ?? "";
  if (!trimmed) {
    return mapUnavailable(policy, "empty_input", method, Date.now() - started);
  }
  if (trimmed.length > 20_000) {
    return mapUnavailable(policy, "input_too_long", method, Date.now() - started);
  }

  try {
    const client = createSeaClient(opts?.timeoutMs ?? 30_000);
    const result = await client.modal.scanTextContent({ text: trimmed });
    const durationMs = Date.now() - started;
    const requestId =
      typeof result?.req_id === "string" ? result.req_id : undefined;

    if (result?.ok !== true) {
      return mapUnavailable(policy, "scan_incomplete", method, durationMs, requestId);
    }
    const level = Number(result.level);
    if (!Number.isFinite(level)) {
      return mapUnavailable(policy, "missing_level", method, durationMs, requestId);
    }
    return decideFromLevel(level, policy, method, durationMs, requestId);
  } catch (err) {
    return mapSdkError(err, method, policy, Date.now() - started);
  }
}

/**
 * Image or video scan. Video requires http(s) URI + isVideo.
 * Image may use https URI or data:image base64 (SDK img_base64).
 */
export async function scanUserImage(input: {
  uri?: string;
  /** data:image/...;base64,... or raw base64 */
  imageBase64?: string;
  isVideo?: boolean;
  timeoutMs?: number;
  policy?: ContentSafetyPolicy;
}): Promise<SafetyVerdict> {
  const method: SafetyMethod = "scanImage";
  const policy =
    input.policy ??
    resolvePolicy(loadSeaInfraContentSafetyConfig()?.policy);
  const started = Date.now();

  let uri = input.uri?.trim();
  let img_base64: string | undefined;

  if (input.isVideo) {
    if (!uri || !/^https?:\/\//i.test(uri)) {
      return mapUnavailable(
        policy,
        "video_requires_http_uri",
        method,
        Date.now() - started,
      );
    }
  } else if (uri) {
    if (!/^https?:\/\//i.test(uri) && !uri.startsWith("data:image/")) {
      return mapUnavailable(policy, "invalid_uri_scheme", method, Date.now() - started);
    }
    if (uri.startsWith("data:image/")) {
      const comma = uri.indexOf(",");
      img_base64 = comma >= 0 ? uri.slice(comma + 1) : undefined;
      uri = undefined;
    }
  } else if (present(input.imageBase64)) {
    const raw = input.imageBase64.trim();
    img_base64 = raw.startsWith("data:image/")
      ? raw.slice(raw.indexOf(",") + 1)
      : raw;
  } else {
    return mapUnavailable(policy, "missing_media", method, Date.now() - started);
  }

  // Bound payload size (~3MB raw base64 chars as a soft guard).
  if (img_base64 && img_base64.length > 4 * 1024 * 1024) {
    return mapUnavailable(policy, "media_too_large", method, Date.now() - started);
  }

  try {
    const client = createSeaClient(input.timeoutMs ?? 60_000);
    const body: Record<string, unknown> = {};
    if (uri) body.uri = uri;
    if (img_base64) body.img_base64 = img_base64;
    if (input.isVideo) body.is_video = true;

    const result = await client.modal.scanImage(body);
    const durationMs = Date.now() - started;
    const requestId =
      typeof result?.req_id === "string" ? result.req_id : undefined;

    if (result?.ok !== true) {
      // Platform rejected input (e.g. dimensions) — not a risk decision.
      return mapUnavailable(
        policy,
        "scan_incomplete",
        method,
        durationMs,
        requestId,
      );
    }
    const level = Number(result.nsfw_level);
    if (!Number.isFinite(level)) {
      return mapUnavailable(policy, "missing_nsfw_level", method, durationMs, requestId);
    }
    return decideFromLevel(level, policy, method, durationMs, requestId);
  } catch (err) {
    return mapSdkError(err, method, policy, Date.now() - started);
  }
}

function mapSdkError(
  err: unknown,
  method: SafetyMethod,
  policy: ContentSafetyPolicy,
  durationMs: number,
): SafetyVerdict {
  const status =
    typeof err === "object" && err !== null && "status" in err
      ? Number((err as { status?: number }).status)
      : undefined;
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : "error";

  if (status === 401 || status === 403 || /Unauthorized|Forbidden/i.test(message)) {
    return mapUnavailable(policy, "auth_failed", method, durationMs);
  }
  if (status === 429 || (status !== undefined && status >= 500)) {
    return mapUnavailable(policy, "upstream_unavailable", method, durationMs);
  }
  if (status === 400) {
    return mapUnavailable(policy, "bad_request", method, durationMs);
  }
  if (/abort|timeout|Timeout/i.test(message)) {
    return mapUnavailable(policy, "timeout", method, durationMs);
  }
  return mapUnavailable(policy, "sdk_error", method, durationMs);
}

/**
 * Enforce policy at a route boundary. Returns a Next-friendly error payload
 * when the action must not proceed.
 */
export function safetyHttpBlock(
  verdict: SafetyVerdict,
): { status: number; error: string; code: string } | null {
  if (verdict.decision === "allow") return null;
  if (verdict.decision === "review") {
    return {
      status: 403,
      error: "Content requires manual review before continuing.",
      code: verdict.reasonCode,
    };
  }
  // block (includes fail-closed unavailable)
  if (!verdict.completed) {
    return {
      status: 503,
      error: "Content safety service unavailable; request rejected (fail-closed).",
      code: verdict.reasonCode,
    };
  }
  return {
    status: 403,
    error: "Content blocked by safety policy.",
    code: verdict.reasonCode,
  };
}
