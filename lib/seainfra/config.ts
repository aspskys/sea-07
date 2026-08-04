import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { TextLlmProtocol } from "@infiplot/types";

export type SeaInfraEnvironment = "test" | "production";

export type SeaInfraLlmConfig = {
  base_url: string | null;
  api_key: string | null;
  model: string | null;
  timeout_ms?: number | null;
  protocol?: TextLlmProtocol | null;
  protocol_probe?: string | null;
};

export type SeaInfraContentSafetyConfig = {
  base_url: string | null;
  api_key: string | null;
  content_types?: string[] | null;
  policy?: string | null;
};

export type SeaInfraMultimodalConfig = {
  base_url: string | null;
  api_key: string | null;
  capabilities?: string[] | null;
  models?: Record<string, string> | null;
};

type SeaInfraConfigFile = {
  activeEnvironment?: SeaInfraEnvironment;
  environments?: Record<
    string,
    {
      llm?: SeaInfraLlmConfig;
      content_safety?: SeaInfraContentSafetyConfig;
      multimodal?: SeaInfraMultimodalConfig;
    }
  >;
};

const VALID_TEXT_PROTOCOLS: readonly TextLlmProtocol[] = [
  "openai_chat_completions",
  "openai_responses",
  "anthropic_messages",
];

function configPath(): string {
  return path.join(process.cwd(), ".agents", "seainfra", "config.json");
}

/**
 * Read SeaInfra unified config (facts source for onboarding). Missing file
 * or unreadable JSON → null (env-only mode). Never throws on missing file.
 */
export function readSeaInfraConfig(): SeaInfraConfigFile | null {
  const file = configPath();
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as SeaInfraConfigFile;
  } catch {
    return null;
  }
}

export function resolveSeaInfraEnvironment(
  override?: string | null,
): SeaInfraEnvironment {
  const raw =
    override?.trim() ||
    process.env.SEAINFRA_ENV?.trim() ||
    readSeaInfraConfig()?.activeEnvironment ||
    "test";
  return raw === "production" ? "production" : "test";
}

export function loadSeaInfraLlmConfig(
  environment?: SeaInfraEnvironment,
): SeaInfraLlmConfig | null {
  const cfg = readSeaInfraConfig();
  if (!cfg) return null;
  const env = environment ?? resolveSeaInfraEnvironment();
  const llm = cfg.environments?.[env]?.llm;
  if (!llm) return null;
  return llm;
}

export function loadSeaInfraContentSafetyConfig(
  environment?: SeaInfraEnvironment,
): SeaInfraContentSafetyConfig | null {
  const cfg = readSeaInfraConfig();
  if (!cfg) return null;
  const env = environment ?? resolveSeaInfraEnvironment();
  return cfg.environments?.[env]?.content_safety ?? null;
}

export function loadSeaInfraMultimodalConfig(
  environment?: SeaInfraEnvironment,
): SeaInfraMultimodalConfig | null {
  const cfg = readSeaInfraConfig();
  if (!cfg) return null;
  const env = environment ?? resolveSeaInfraEnvironment();
  return cfg.environments?.[env]?.multimodal ?? null;
}

/**
 * Sea SDK Client expects the gateway *root*. LLM-only paths end with `/llm`
 * and model paths with `/model`; strip those so modal scan hits `/model/v1/...`.
 */
export function resolveSeaGatewayRoot(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "").replace(/\/(llm|model)$/i, "");
}

export function coerceTextLlmProtocol(
  value: unknown,
): TextLlmProtocol | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim() as TextLlmProtocol;
  return (VALID_TEXT_PROTOCOLS as readonly string[]).includes(v) ? v : undefined;
}
