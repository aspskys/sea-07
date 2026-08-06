import {
  getPaymentSecurityConfig,
  type PaymentSecurityConfig,
} from "./config";
import { getOrderByCpOrderId, updateOrder } from "./orderStore";
import { verifySandboxCallbackSignature } from "./sandbox";
import { verifyPlatformCallbackSignature } from "./starry";

export type CallbackProcessResult = {
  httpStatus: number;
  code: number;
  message: string;
  /** Order status after processing, if known. */
  orderStatus?: string;
  fulfilled?: boolean;
  duplicate?: boolean;
};

type CallbackBody = {
  event_id?: string;
  event_time_ms?: number;
  event_type?: number;
  one_time_purchase_result?: {
    sys_order_id?: string;
    cp_order_id?: string;
    cp_account_id?: string;
    client_id?: string;
    status?: number;
    pay_currency?: string;
    pay_amount?: number;
    cp_payload?: string;
  };
};

function ok(
  code = 20000,
  message = "Success",
  httpStatus = 200,
  extra: Partial<CallbackProcessResult> = {},
): CallbackProcessResult {
  return { httpStatus, code, message, ...extra };
}

/**
 * Shared callback processor for route handler and sandbox e2e harness.
 */
export async function processPaymentCallback(input: {
  rawBody: string;
  signVersion: string;
  key: string;
  requestId: string;
  signature: string;
  /** When true, accept sandbox HMAC if PAYMENT_SANDBOX_SIMULATE is enabled. */
  allowSandbox?: boolean;
  config?: PaymentSecurityConfig;
}): Promise<CallbackProcessResult> {
  let config: PaymentSecurityConfig;
  try {
    config = input.config ?? getPaymentSecurityConfig();
  } catch {
    return ok(50001, "Payment callback is not configured.", 503);
  }

  const rsaOk = verifyPlatformCallbackSignature({
    rawBody: input.rawBody,
    signVersion: input.signVersion,
    key: input.key,
    requestId: input.requestId,
    signature: input.signature,
    publicKey: config.publicKey,
  });
  const sandboxOk =
    Boolean(input.allowSandbox) &&
    verifySandboxCallbackSignature({
      rawBody: input.rawBody,
      signVersion: input.signVersion,
      key: input.key,
      requestId: input.requestId,
      signature: input.signature,
      signingKey: config.signingKey,
    });

  if (
    !input.key ||
    input.key !== config.signingKey ||
    !input.requestId ||
    !input.signature ||
    (!rsaOk && !sandboxOk)
  ) {
    return ok(40001, "Invalid signature.", 401);
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(input.rawBody);
  } catch {
    return ok(40002, "Invalid JSON.", 400);
  }

  const callback = parsedJson as CallbackBody;
  if (
    typeof callback.event_id !== "string" ||
    typeof callback.event_type !== "number" ||
    typeof callback.event_time_ms !== "number"
  ) {
    return ok(40003, "Invalid callback payload.", 400);
  }

  if (callback.event_type !== 1 || !callback.one_time_purchase_result) {
    return ok();
  }

  const result = callback.one_time_purchase_result;
  if (!result.cp_order_id || !result.sys_order_id || !result.client_id) {
    return ok(40003, "Invalid callback payload.", 400);
  }

  const order = await getOrderByCpOrderId(result.cp_order_id);
  if (!order) return ok(40004, "Payment order not found.", 404);

  if (order.processedEventIds.includes(callback.event_id)) {
    return ok(20000, "Success", 200, {
      orderStatus: order.status,
      fulfilled: order.status === "SUCCEEDED",
      duplicate: true,
    });
  }

  const paidAmountCents =
    typeof result.pay_amount === "number"
      ? Math.round(result.pay_amount * 100)
      : null;
  const identityErrors = [
    result.sys_order_id !== order.sysOrderId ? "sys_order_id" : null,
    result.client_id !== config.clientId ? "client_id" : null,
    result.cp_account_id && result.cp_account_id !== order.userId
      ? "cp_account_id"
      : null,
    result.cp_payload && result.cp_payload !== order.cpOrderId
      ? "cp_payload"
      : null,
    result.status === 2 && result.pay_currency !== order.currency
      ? "pay_currency"
      : null,
    result.status === 2 && paidAmountCents !== order.amountCents
      ? "pay_amount"
      : null,
  ]
    .filter(Boolean)
    .join(", ");

  if (identityErrors) {
    await updateOrder(order.cpOrderId, {
      lastError: `Callback validation failed: ${identityErrors}`,
      processedEventIds: [...order.processedEventIds, callback.event_id],
    });
    return ok(40005, "Callback does not match the order.", 400);
  }

  const eventTimeMs = callback.event_time_ms;
  const isOlderEvent =
    order.lastEventTimeMs !== null && eventTimeMs < order.lastEventTimeMs;
  const nextEvents = [...order.processedEventIds, callback.event_id];

  if (isOlderEvent) {
    await updateOrder(order.cpOrderId, { processedEventIds: nextEvents });
    return ok(20000, "Success", 200, { orderStatus: order.status });
  }

  if (result.status === 2) {
    const already = order.status === "SUCCEEDED";
    await updateOrder(order.cpOrderId, {
      status: "SUCCEEDED",
      platformStatus: result.status,
      lastEventTimeMs: eventTimeMs,
      fulfilledAt: order.fulfilledAt ?? new Date().toISOString(),
      lastError: null,
      processedEventIds: nextEvents,
    });
    return ok(20000, "Success", 200, {
      orderStatus: "SUCCEEDED",
      fulfilled: true,
      duplicate: already,
    });
  }

  if (result.status === 3 && order.status !== "SUCCEEDED") {
    await updateOrder(order.cpOrderId, {
      status: "FAILED",
      platformStatus: result.status,
      lastEventTimeMs: eventTimeMs,
      processedEventIds: nextEvents,
    });
    return ok(20000, "Success", 200, { orderStatus: "FAILED" });
  }

  await updateOrder(order.cpOrderId, {
    processedEventIds: nextEvents,
    lastEventTimeMs: eventTimeMs,
  });
  return ok(20000, "Success", 200, { orderStatus: order.status });
}
