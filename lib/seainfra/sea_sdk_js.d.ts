/** Minimal typings for the official Sea SDK (package has no shipped .d.ts). */
declare module "sea_sdk_js" {
  export const sdkVersion: string;
  export const defaultBaseURL: string;
  export const defaultTimeout: number;

  export class Client {
    constructor(config?: {
      apiKey?: string;
      APIKey?: string;
      baseURL?: string;
      BaseURL?: string;
      modelBaseURL?: string;
      llmBaseURL?: string;
      timeout?: number;
      project?: string;
      fetch?: typeof fetch;
    });
    apiKey: string;
    baseURL: string;
    modelBaseURL: string;
    llmBaseURL: string;
    modal: ModalService;
  }

  export class ModalTask {
    id: string;
    status: string;
    model?: string;
    progress?: number;
    output?: unknown[];
    error?: { code?: number | string; message?: string; error_message?: string };
    wait(...options: unknown[]): Promise<ModalTask>;
  }

  export class ModalService {
    create(body: Record<string, unknown>, ...options: unknown[]): Promise<ModalTask>;
    get(taskId: string, ...options: unknown[]): Promise<ModalTask>;
    wait(taskId: string, ...options: unknown[]): Promise<ModalTask>;
    precharge(body: Record<string, unknown>, ...options: unknown[]): Promise<Record<string, unknown>>;
    listModels(params?: Record<string, unknown>, ...options: unknown[]): Promise<{
      hits?: Array<Record<string, unknown>>;
      [key: string]: unknown;
    }>;
    searchModels(params?: Record<string, unknown>, ...options: unknown[]): Promise<{
      hits?: Array<Record<string, unknown>>;
      [key: string]: unknown;
    }>;
    getModelSkill(model: string, ...options: unknown[]): Promise<string | Record<string, unknown>>;
    scanText(request: { text: string }, ...options: unknown[]): Promise<{
      data?: { is_sensitive?: boolean; sensitive_words?: unknown };
      status?: { code?: number; request_id?: string; msg?: string };
      [key: string]: unknown;
    }>;
    scanTextContent(request: { text: string }, ...options: unknown[]): Promise<{
      ok?: boolean;
      req_id?: string;
      level?: number;
      label?: string;
      reason?: string;
      [key: string]: unknown;
    }>;
    scanImage(
      request: {
        uri?: string;
        img_base64?: string;
        is_video?: boolean;
        risk_types?: string[];
      },
      ...options: unknown[]
    ): Promise<{
      ok?: boolean;
      req_id?: string;
      nsfw_level?: number;
      risk_types?: string[];
      label_items?: unknown[];
      error?: string;
      [key: string]: unknown;
    }>;
    scanVisualStructuredTextFusion(
      request: Record<string, unknown>,
      ...options: unknown[]
    ): Promise<Record<string, unknown>>;
  }

  export function withPollTimeout(timeout: number): unknown;
  export function withPollInterval(interval: number): unknown;

  export function createClient(config?: ConstructorParameters<typeof Client>[0]): Client;
  export const New: typeof createClient;
}
