import { NextRequest, NextResponse } from "next/server";
import {
  getPaymentSecurityConfig,
  PaymentConfigurationError,
} from "@/lib/payment/config";
import { getOrderByCpOrderId, updateOrder } from "@/lib/payment/orderStore";
import { verifyPlatformCallbackSignature } from "@/lib/payment/starry";

export const runtime = "nodejs";

function callbackResponse(code = 20000, message = "Success", status = 200) {
  return NextResponse.json({ code, message, data: null }, { status });
}

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

export async function POST(request: NextRequest) {
  let config;
  try {
    config = getPaymentSecurityConfig();
  } catch (error) {
    if (error instanceof PaymentConfigurationError) {
      return callbackResponse(50001, "Payment callback is not configured.", 503);
    }
    throw error;
  }

  const rawBody = await request.text();
  const signVersion = request.headers.get("sign-version") ?? "";
  const key = request.headers.get("key") ?? "";
  const requestId = request.headers.get("request-id") ?? "";
  const signature = request.headers.get("sign") ?? "";

  if (
    !key ||
    key !== config.signingKey ||
    !requestId ||
    !signature ||
    !verifyPlatformCallbackSignature({
      rawBody,
      signVersion,
      key,
      requestId,
      signature,
      publicKey: config.publicKey,
    })
  ) {
    return callbackResponse(40001, "Invalid signature.", 401);
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    return callbackResponse(40002, "Invalid JSON.", 400);
  }

  const callback = parsedJson as CallbackBody;
  if (
    typeof callback.event_id !== "string" ||
    typeof callback.event_type !== "number" ||
    typeof callback.event_time_ms !== "number"
  ) {
    return callbackResponse(40003, "Invalid callback payload.", 400);
  }

  // event_type 1 = one-time purchase result (subscription not in scope)
  if (callback.event_type !== 1 || !callback.one_time_purchase_result) {
    return callbackResponse();
  }

  const result = callback.one_time_purchase_result;
  if (!result.cp_order_id || !result.sys_order_id || !result.client_id) {
    return callbackResponse(40003, "Invalid callback payload.", 400);
  }

  const order = await getOrderByCpOrderId(result.cp_order_id);
  if (!order) return callbackResponse(40004, "Payment order not found.", 404);

  if (order.processedEventIds.includes(callback.event_id)) {
    return callbackResponse();
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
    return callbackResponse(40005, "Callback does not match the order.", 400);
  }

  const eventTimeMs = callback.event_time_ms;
  const isOlderEvent =
    order.lastEventTimeMs !== null && eventTimeMs < order.lastEventTimeMs;
  const nextEvents = [...order.processedEventIds, callback.event_id];

  if (isOlderEvent) {
    await updateOrder(order.cpOrderId, { processedEventIds: nextEvents });
    return callbackResponse();
  }

  if (result.status === 2) {
    await updateOrder(order.cpOrderId, {
      status: "SUCCEEDED",
      platformStatus: result.status,
      lastEventTimeMs: eventTimeMs,
      fulfilledAt: order.fulfilledAt ?? new Date().toISOString(),
      lastError: null,
      processedEventIds: nextEvents,
    });
    return callbackResponse();
  }

  if (result.status === 3 && order.status !== "SUCCEEDED") {
    await updateOrder(order.cpOrderId, {
      status: "FAILED",
      platformStatus: result.status,
      lastEventTimeMs: eventTimeMs,
      processedEventIds: nextEvents,
    });
  } else {
    await updateOrder(order.cpOrderId, {
      processedEventIds: nextEvents,
      lastEventTimeMs: eventTimeMs,
    });
  }

  return callbackResponse();
}
