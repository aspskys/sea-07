/**
 * Sandbox notify path for local/e2e business callbacks.
 *
 * Real platform callbacks use RSA-SHA256 with the platform key pair
 * (verifyPlatformCallbackSignature). We do not hold that private key, so
 * sandbox e2e uses HMAC-SHA256 over the same string layout with the
 * server signingKey as shared secret, gated by PAYMENT_SANDBOX_SIMULATE=1.
 *
 * Production must keep PAYMENT_SANDBOX_SIMULATE unset/false.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { PAYMENT_SIGN_VERSION } from "./starry";

export function isPaymentSandboxSimulateEnabled() {
  const v = process.env.PAYMENT_SANDBOX_SIMULATE?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function sandboxSignPayload(input: {
  rawBody: string;
  key: string;
  requestId: string;
  signVersion?: string;
}) {
  const signVersion = input.signVersion || PAYMENT_SIGN_VERSION;
  const source = `${signVersion}${input.key}${input.requestId}${input.rawBody}`;
  return createHmac("sha256", input.key).update(source).digest("base64");
}

export function verifySandboxCallbackSignature(input: {
  rawBody: string;
  signVersion: string;
  key: string;
  requestId: string;
  signature: string;
  signingKey: string;
}) {
  if (!isPaymentSandboxSimulateEnabled()) return false;
  if (input.signVersion !== PAYMENT_SIGN_VERSION) return false;
  if (input.key !== input.signingKey) return false;
  const expected = sandboxSignPayload({
    rawBody: input.rawBody,
    key: input.key,
    requestId: input.requestId,
    signVersion: input.signVersion,
  });
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(input.signature);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
