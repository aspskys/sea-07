#!/usr/bin/env node
/**
 * Sandbox payment + business callback e2e (no browser).
 *
 * 1) Real platform create_order (method_list channel check)
 * 2) Local order store + sandbox HMAC notify (PAYMENT_SANDBOX_SIMULATE=1)
 * 3) Idempotent second notify
 * 4) Failure-path notify for a separate unpaid identity mismatch case
 *
 * Usage:
 *   PAYMENT_SANDBOX_SIMULATE=1 node --import tsx scripts/payment-sandbox-e2e.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

function loadEnvFile(file) {
  try {
    const text = readFileSync(file, "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      let v = m[2];
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      v = v.replace(/\\n/g, "\n");
      if (!process.env[m[1]]) process.env[m[1]] = v;
    }
  } catch {
    // optional
  }
}

loadEnvFile(".env.development");
loadEnvFile(".env.local");
process.env.PAYMENT_SANDBOX_SIMULATE = "1";
process.env.PAYMENT_CHANNELS =
  process.env.PAYMENT_CHANNELS || "PayerMax";

const {
  createPlatformOrder,
  getPlatformOrder,
  createRequestId,
  PAYMENT_SIGN_VERSION,
} = await import("../lib/payment/starry.ts");
const { getPaymentConfig } = await import("../lib/payment/config.ts");
const { createOrder, getOrderByCpOrderId } = await import(
  "../lib/payment/orderStore.ts"
);
const { processPaymentCallback } = await import(
  "../lib/payment/callbackProcess.ts"
);
const { sandboxSignPayload } = await import("../lib/payment/sandbox.ts");

const config = getPaymentConfig();
const report = {
  startedAt: new Date().toISOString(),
  steps: [],
  ok: false,
};

function step(name, data) {
  report.steps.push({ name, ...data, at: new Date().toISOString() });
  console.log(JSON.stringify({ step: name, ...data }));
}

// Channel list
{
  const { createPlatformRequestSignature } = await import(
    "../lib/payment/starry.ts"
  );
  const body = JSON.stringify({ client_id: config.clientId });
  const requestId = createRequestId();
  const signature = createPlatformRequestSignature({
    body,
    key: config.signingKey,
    publicKey: config.publicKey,
    requestId,
  });
  const res = await fetch(
    `${config.gatewayBaseUrl}/open_api/payment/method_list`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Xh-Os": "node",
        "Xh-Sdk-Version": "3.4.0",
        "Sign-Version": PAYMENT_SIGN_VERSION,
        "Request-Id": requestId,
        Key: config.signingKey,
        Sign: signature,
      },
      body,
      signal: AbortSignal.timeout(15000),
    },
  );
  const json = await res.json();
  const list = json.data?.payment_method_list || [];
  const channels = [
    ...new Set(list.map((x) => x.payment_channel_name).filter(Boolean)),
  ];
  step("method_list", {
    ok: json.code === 20000 && list.length > 0,
    code: json.code,
    count: list.length,
    channels,
  });
  if (json.code !== 20000 || list.length === 0) {
    report.ok = false;
    finish();
    process.exit(1);
  }
}

const cpOrderId = `SBX_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
const amountCents = 100;
const userId = "sandbox_e2e_user";
const expiresAt = new Date(Date.now() + 20 * 60 * 1000);
const notifyUrl = `${(config.publicBaseUrl || "http://127.0.0.1:3000").replace(/\/$/, "")}/api/payments/callback`;

await createOrder({
  cpOrderId,
  userId,
  amountCents,
  currency: "USD",
  note: "sandbox e2e",
  expiresAt: expiresAt.toISOString(),
});

const platformOrder = await createPlatformOrder(config, {
  cpOrderId,
  amountCents,
  userId,
  notifyUrl,
  expiresAt,
  locale: "en",
});

const { updateOrder } = await import("../lib/payment/orderStore.ts");
await updateOrder(cpOrderId, {
  sysOrderId: platformOrder.sys_order_id,
  status: "PENDING",
});

const info = await getPlatformOrder(config, platformOrder.sys_order_id);
step("create_order", {
  ok: true,
  cpOrderId_prefix: cpOrderId.slice(0, 14) + "…",
  sys_order_id_prefix: platformOrder.sys_order_id.slice(0, 12) + "…",
  business_type: platformOrder.business_type,
  platform_status: info.status,
  is_sandbox: info.is_sandbox,
  notifyUrl_host: new URL(notifyUrl).host,
});

const eventId = `evt_sandbox_${Date.now().toString(36)}`;
const rawBody = JSON.stringify({
  event_id: eventId,
  event_time_ms: Date.now(),
  event_type: 1,
  one_time_purchase_result: {
    sys_order_id: platformOrder.sys_order_id,
    cp_order_id: cpOrderId,
    cp_account_id: userId,
    client_id: config.clientId,
    status: 2,
    pay_currency: "USD",
    pay_amount: amountCents / 100,
    cp_payload: cpOrderId,
  },
});
const requestId = createRequestId();
const signature = sandboxSignPayload({
  rawBody,
  key: config.signingKey,
  requestId,
});

const first = await processPaymentCallback({
  rawBody,
  signVersion: PAYMENT_SIGN_VERSION,
  key: config.signingKey,
  requestId,
  signature,
  allowSandbox: true,
  config,
});
const afterFirst = await getOrderByCpOrderId(cpOrderId);
step("sandbox_callback_success", {
  ok: first.code === 20000 && afterFirst?.status === "SUCCEEDED",
  code: first.code,
  orderStatus: afterFirst?.status,
  fulfilledAt: afterFirst?.fulfilledAt,
  fulfilled: first.fulfilled,
});

const second = await processPaymentCallback({
  rawBody,
  signVersion: PAYMENT_SIGN_VERSION,
  key: config.signingKey,
  requestId,
  signature,
  allowSandbox: true,
  config,
});
const afterSecond = await getOrderByCpOrderId(cpOrderId);
step("sandbox_callback_idempotent", {
  ok: second.code === 20000 && second.duplicate === true && afterSecond?.status === "SUCCEEDED",
  code: second.code,
  duplicate: second.duplicate,
  orderStatus: afterSecond?.status,
  eventCount: afterSecond?.processedEventIds?.length,
});

// Bad signature path
const bad = await processPaymentCallback({
  rawBody,
  signVersion: PAYMENT_SIGN_VERSION,
  key: config.signingKey,
  requestId: createRequestId(),
  signature: "not-a-valid-signature",
  allowSandbox: true,
  config,
});
step("sandbox_callback_bad_signature", {
  ok: bad.httpStatus === 401 && bad.code === 40001,
  code: bad.code,
  httpStatus: bad.httpStatus,
});

// Amount mismatch path on a second order
const cp2 = `SBX_${Date.now().toString(36)}_bad`;
await createOrder({
  cpOrderId: cp2,
  userId,
  amountCents: 200,
  currency: "USD",
  note: "mismatch",
  expiresAt: expiresAt.toISOString(),
});
const platform2 = await createPlatformOrder(config, {
  cpOrderId: cp2,
  amountCents: 200,
  userId,
  notifyUrl,
  expiresAt,
  locale: "en",
});
await updateOrder(cp2, {
  sysOrderId: platform2.sys_order_id,
  status: "PENDING",
});
const mismatchBody = JSON.stringify({
  event_id: `evt_bad_${Date.now().toString(36)}`,
  event_time_ms: Date.now(),
  event_type: 1,
  one_time_purchase_result: {
    sys_order_id: platform2.sys_order_id,
    cp_order_id: cp2,
    cp_account_id: userId,
    client_id: config.clientId,
    status: 2,
    pay_currency: "USD",
    pay_amount: 1.0, // wrong vs 2.00 order
    cp_payload: cp2,
  },
});
const rid3 = createRequestId();
const sig3 = sandboxSignPayload({
  rawBody: mismatchBody,
  key: config.signingKey,
  requestId: rid3,
});
const mismatch = await processPaymentCallback({
  rawBody: mismatchBody,
  signVersion: PAYMENT_SIGN_VERSION,
  key: config.signingKey,
  requestId: rid3,
  signature: sig3,
  allowSandbox: true,
  config,
});
const afterMismatch = await getOrderByCpOrderId(cp2);
step("sandbox_callback_amount_mismatch", {
  ok: mismatch.code === 40005 && afterMismatch?.status !== "SUCCEEDED",
  code: mismatch.code,
  orderStatus: afterMismatch?.status,
});

report.ok = report.steps.every((s) => s.ok !== false);
report.finishedAt = new Date().toISOString();
finish();
process.exit(report.ok ? 0 : 1);

function finish() {
  mkdirSync(".agents/seainfra/probes", { recursive: true });
  const out = path.join(
    ".agents/seainfra/probes",
    `payment-sandbox-e2e-${Date.now()}.json`,
  );
  writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ reportPath: out, ok: report.ok }, null, 2));
}
