/**
 * Server-side StarUnion reporting adapter (HTTP path).
 *
 * Pre-formal: config from SERVER_STARUNION_CONFIG env (not committed).
 * Business events require a confirmed tracking plan — do not invent log_*_server names.
 *
 * This module only provides initialize / trackEvent / flush hooks. Encryption
 * and collector calls are implemented when the first confirmed server event
 * is approved (see seainfra-tracking-server-integrate HTTP transport).
 */

export type ServerTrackingIdentity = {
  st_account_id?: string;
  st_distinct_id?: string;
  st_role_id?: string;
};

export type ServerStarunionConfig = {
  stage: string;
  project_key: string;
  project_name: string;
  agent_uri: string;
  aes_id: string;
  aes_key: string;
  aes_secret: string;
  v_sign_key?: string;
  v_sign_pub_key?: string;
  [key: string]: unknown;
};

let cachedConfig: ServerStarunionConfig | null | undefined;

export function loadServerStarunionConfig(): ServerStarunionConfig | null {
  if (cachedConfig !== undefined) return cachedConfig;
  const raw = process.env.SERVER_STARUNION_CONFIG;
  if (!raw?.trim()) {
    cachedConfig = null;
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as ServerStarunionConfig;
    if (!parsed?.aes_id || !parsed?.aes_key || !parsed?.aes_secret || !parsed?.agent_uri) {
      cachedConfig = null;
      return null;
    }
    cachedConfig = parsed;
    return parsed;
  } catch {
    cachedConfig = null;
    return null;
  }
}

export function isServerTrackingReady(): boolean {
  return loadServerStarunionConfig() !== null;
}

/**
 * Placeholder until a confirmed plan event is implemented.
 * Call sites must not invent event names; pass only scheme-approved names.
 */
export async function trackServerEvent(_input: {
  identity: ServerTrackingIdentity;
  eventName: string;
  eventTimeMs?: number;
  properties?: Record<string, unknown>;
}): Promise<{ ok: boolean; reason?: string }> {
  if (!isServerTrackingReady()) {
    return { ok: false, reason: "SERVER_STARUNION_CONFIG missing" };
  }
  return {
    ok: false,
    reason: "server event transport not enabled until tracking plan is confirmed",
  };
}
