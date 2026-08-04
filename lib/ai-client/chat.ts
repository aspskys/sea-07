import OpenAI from "openai";
import type {
  ChatStreamResult,
  ChatStreamUsage,
  ProviderConfig,
  TextLlmProtocol,
} from "@infiplot/types";
import { normalizeBaseUrl } from "./normalizeUrl";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

function resolveTextProtocol(config: ProviderConfig): TextLlmProtocol {
  return config.textProtocol ?? "openai_chat_completions";
}

/** Split system prompts into Responses `instructions`; rest become `input`. */
function splitForResponses(messages: ChatMessage[]): {
  instructions?: string;
  input: string | Array<{ role: "user" | "assistant"; content: string }>;
} {
  const systems: string[] = [];
  const rest: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const m of messages) {
    if (m.role === "system") {
      if (m.content.trim()) systems.push(m.content);
      continue;
    }
    rest.push({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    });
  }
  const instructions =
    systems.length > 0 ? systems.join("\n\n") : undefined;
  if (rest.length === 0) {
    return { instructions, input: "" };
  }
  const only = rest[0];
  if (rest.length === 1 && only && only.role === "user" && !instructions) {
    return { input: only.content };
  }
  return { instructions, input: rest };
}

function extractResponsesText(response: {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
}): string {
  if (typeof response.output_text === "string" && response.output_text.length > 0) {
    return response.output_text;
  }
  const parts: string[] = [];
  for (const item of response.output ?? []) {
    if (item?.type !== "message") continue;
    for (const c of item.content ?? []) {
      if (
        (c?.type === "output_text" || c?.type === "text") &&
        typeof c.text === "string"
      ) {
        parts.push(c.text);
      }
    }
  }
  return parts.join("");
}

function clientTimeoutSignal(timeoutMs: number | undefined): {
  signal?: AbortSignal;
  clear: () => void;
} {
  if (!timeoutMs || timeoutMs <= 0) return { clear: () => {} };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  };
}

// ── CORS proxy fallback (browser-only) ───────────────────────────────
// BYO mode calls providers directly from the browser. When a provider
// rejects the preflight (no CORS headers), the first request throws a
// TypeError. We cache the blocked host and transparently reroute all
// subsequent requests through /api/llm/user-proxy, which forwards
// server-side and returns the upstream response (including SSE streams)
// byte-for-byte.

const corsBlockedHosts = new Set<string>();

export function isCorsProxied(baseUrl: string): boolean {
  try {
    return corsBlockedHosts.has(new URL(baseUrl).host);
  } catch {
    return false;
  }
}

function proxyFetch(
  config: ProviderConfig,
  init?: RequestInit,
): Promise<Response> {
  let body: Record<string, unknown> = {};
  if (typeof init?.body === "string") {
    try { body = JSON.parse(init.body); } catch { /* empty */ }
  }
  return globalThis.fetch("/api/llm/user-proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "openai",
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      body,
      model: config.model,
      stream: body.stream === true,
    }),
  });
}

function makeCorsAwareFetch(
  config: ProviderConfig,
): (input: string | URL | Request, init?: RequestInit) => Promise<Response> {
  return async (input, init) => {
    const url =
      typeof input === "string" ? input
      : input instanceof URL ? input.toString()
      : input.url;

    let host: string;
    try { host = new URL(url).host; } catch { return globalThis.fetch(input, init); }

    if (corsBlockedHosts.has(host)) {
      return proxyFetch(config, init);
    }

    try {
      return await globalThis.fetch(input, init);
    } catch (err) {
      if (err instanceof TypeError) {
        corsBlockedHosts.add(host);
        console.warn(`[CORS] ${host} blocked, falling back to server proxy`);
        return proxyFetch(config, init);
      }
      throw err;
    }
  };
}

// Cache observability for the prompt-prefix caching that the Writer stable
// prefix relies on. The OpenAI usage object reports only cached READS
// (prompt_tokens_details.cached_tokens) and has no field for cache WRITES
// (tokens written to the cache on a cold pass), so unlike the old AI SDK
// path we can show the hit rate but not the create cost. cached_tokens lives
// directly on the SDK's CompletionUsage type — no cast needed.
type UsageSummary = {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number | null } | null;
};

function summarizeSdkUsage(
  tag: string,
  usage: UsageSummary | undefined,
): string {
  if (!usage) return `[cache] ${tag} no-usage`;
  const input = usage.prompt_tokens ?? 0;
  const output = usage.completion_tokens ?? 0;
  const cached = usage.prompt_tokens_details?.cached_tokens;
  if (typeof cached === "number") {
    const rate = input > 0 ? ((cached / input) * 100).toFixed(1) : "n/a";
    return `[cache] ${tag} hit=${cached} input=${input} rate=${rate}% completion=${output}`;
  }
  return `[cache] ${tag} input=${input} completion=${output} (provider didn't report cache stats)`;
}

function makeClient(config: ProviderConfig): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: normalizeBaseUrl(config.baseUrl, "openai_compatible"),
    maxRetries: 0,
    dangerouslyAllowBrowser: true,
    ...(typeof window !== "undefined" ? { fetch: makeCorsAwareFetch(config) } : {}),
  });
}

export async function chat(
  config: ProviderConfig,
  messages: ChatMessage[],
  opts?: {
    temperature?: number;
    tag?: string;
  },
): Promise<string> {
  const protocol = resolveTextProtocol(config);
  if (protocol === "anthropic_messages") {
    throw new Error(
      "TEXT protocol anthropic_messages is not implemented in this adapter; re-run SeaInfra protocol probe and select a supported OpenAI protocol.",
    );
  }

  const client = makeClient(config);
  const tag = opts?.tag ?? "chat";
  const { signal, clear } = clientTimeoutSignal(config.timeoutMs);

  try {
    if (protocol === "openai_responses") {
      // Non-streaming only — SeaInfra probe covers non-stream Responses shape.
      const { instructions, input } = splitForResponses(messages);
      const response = await client.responses.create(
        {
          model: config.model,
          input,
          ...(instructions ? { instructions } : {}),
          temperature: opts?.temperature ?? 0.9,
        },
        signal ? { signal } : undefined,
      );
      const text = extractResponsesText(response);
      const usage = response.usage
        ? {
            prompt_tokens: response.usage.input_tokens ?? 0,
            completion_tokens: response.usage.output_tokens ?? 0,
          }
        : undefined;
      console.log(summarizeSdkUsage(`${tag}:responses`, usage));
      if (text.length === 0) {
        throw new Error(`Responses API returned no content.`);
      }
      return text;
    }

    const completion = await client.chat.completions.create(
      {
        model: config.model,
        messages: messages.map((m) => ({
          role: m.role as "system" | "user" | "assistant",
          content: m.content,
        })),
        temperature: opts?.temperature ?? 0.9,
        stream: false,
      },
      signal ? { signal } : undefined,
    );

    const text = completion.choices[0]?.message?.content ?? "";
    console.log(summarizeSdkUsage(tag, completion.usage ?? undefined));

    if (text.length === 0) {
      throw new Error(`Chat API returned no content.`);
    }
    return text;
  } finally {
    clear();
  }
}

/**
 * Streaming variant of {@link chat} — the streaming primitive behind
 * paradigm D. Returns incremental `textStream` chunks plus an end-of-stream
 * `usage` promise so `summarizeSdkUsage` keeps doing cache accounting.
 *
 * Uses the OpenAI SDK's native streaming (`stream: true`) which returns an
 * async iterable of ChatCompletionChunk. The returned `usage` settles after
 * the stream drains, so callers should `await result.usage` once iteration
 * ends.
 *
 * Degrade path: if the provider doesn't support streaming, fall back to a
 * single non-streaming call wrapped as a one-chunk stream so downstream
 * tag-routing still works — the player loses progressive playback but the
 * scene generates normally.
 */
export function chatStream(
  config: ProviderConfig,
  messages: ChatMessage[],
  opts?: {
    temperature?: number;
    tag?: string;
  },
): ChatStreamResult {
  const protocol = resolveTextProtocol(config);
  const client = makeClient(config);
  const tag = opts?.tag ?? "chatStream";
  const msgPayload = messages.map((m) => ({
    role: m.role as "system" | "user" | "assistant",
    content: m.content,
  }));

  let resolveUsage: (u: ChatStreamUsage | undefined) => void;
  const usage = new Promise<ChatStreamUsage | undefined>((r) => { resolveUsage = r; });

  const textStream = (async function* (): AsyncIterable<string> {
    // Responses streaming was not covered by SeaInfra probe — degrade to
    // one-shot non-streaming so progressive UI still gets a complete reply
    // without claiming unsupported stream semantics.
    if (protocol === "openai_responses" || protocol === "anthropic_messages") {
      try {
        const text = await chat(config, messages, {
          temperature: opts?.temperature,
          tag: `${tag}:probe-unverified-stream`,
        });
        if (text) yield text;
        resolveUsage!(undefined);
      } catch (err) {
        resolveUsage!(undefined);
        throw err;
      }
      return;
    }

    try {
      const stream = await client.chat.completions.create({
        model: config.model,
        messages: msgPayload,
        temperature: opts?.temperature ?? 0.9,
        stream: true,
        stream_options: { include_usage: true },
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) yield delta;

        if (chunk.usage) {
          const u: ChatStreamUsage = {
            prompt_tokens: chunk.usage.prompt_tokens,
            completion_tokens: chunk.usage.completion_tokens,
            prompt_tokens_details: chunk.usage.prompt_tokens_details
              ? { cached_tokens: chunk.usage.prompt_tokens_details.cached_tokens ?? undefined }
              : undefined,
          };
          console.log(summarizeSdkUsage(tag, chunk.usage));
          resolveUsage!(u);
        }
      }
      // If usage was never emitted (provider omitted it), resolve undefined.
      resolveUsage!(undefined);
    } catch (err) {
      // Streaming not supported by provider → degrade to buffered call.
      console.warn(
        `[chatStream] streaming failed, degrading to non-streaming:`,
        err,
      );
      try {
        const completion = await client.chat.completions.create({
          model: config.model,
          messages: msgPayload,
          temperature: opts?.temperature ?? 0.9,
          stream: false,
        });
        const text = completion.choices[0]?.message?.content ?? "";
        if (text) yield text;
        console.log(summarizeSdkUsage(`${tag}:degraded`, completion.usage ?? undefined));
        resolveUsage!(completion.usage ? {
          prompt_tokens: completion.usage.prompt_tokens,
          completion_tokens: completion.usage.completion_tokens,
          prompt_tokens_details: completion.usage.prompt_tokens_details
            ? { cached_tokens: completion.usage.prompt_tokens_details.cached_tokens ?? undefined }
            : undefined,
        } : undefined);
      } catch (fallbackErr) {
        resolveUsage!(undefined);
        throw fallbackErr;
      }
    }
  })();

  return { textStream, usage };
}
