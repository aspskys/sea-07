import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  getPaymentConfig,
  PaymentConfigurationError,
  resolvePaymentPublicBaseUrl,
} from "@/lib/payment/config";
import { createOrder, updateOrder } from "@/lib/payment/orderStore";
import {
  createPlatformOrder,
  PaymentPlatformError,
} from "@/lib/payment/starry";
import {
  amountToCents,
  parseCreatePaymentOrderInput,
  PAYMENT_CURRENCY,
} from "@/lib/payment/validation";
import { requireUser } from "@/lib/supabase/guard";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const userId = auth.userId;

  let rawInput: unknown;
  try {
    rawInput = await request.json();
  } catch {
    return NextResponse.json(
      { error: "INVALID_JSON", message: "Body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = parseCreatePaymentOrderInput(rawInput);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: "INVALID_PAYMENT_FORM", message: parsed.error },
      { status: 400 },
    );
  }

  const amountCents = amountToCents(parsed.data.amount);
  if (amountCents === null) {
    return NextResponse.json(
      {
        error: "INVALID_AMOUNT",
        message: "Amount must be between USD 1.00 and USD 9999.99.",
      },
      { status: 400 },
    );
  }

  let config;
  let publicBaseUrl: string;
  try {
    config = getPaymentConfig();
    publicBaseUrl = resolvePaymentPublicBaseUrl(
      request.url,
      config.publicBaseUrl,
    );
  } catch (error) {
    if (error instanceof PaymentConfigurationError) {
      return NextResponse.json(
        {
          error: "PAYMENT_NOT_CONFIGURED",
          message: "Payment environment is not configured.",
        },
        { status: 503 },
      );
    }
    throw error;
  }

  const cpOrderId = `IP_${Date.now().toString(36)}_${randomBytes(8).toString("hex")}`;
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  await createOrder({
    cpOrderId,
    userId,
    amountCents,
    currency: PAYMENT_CURRENCY,
    note: parsed.data.note || null,
    expiresAt: expiresAt.toISOString(),
  });

  // Prefer configured public origin (https://seachat.ai) so platform notify
  // hits the deployable callback even when the request origin is localhost.
  const notifyUrl = new URL(
    "/api/payments/callback",
    publicBaseUrl,
  ).toString();

  try {
    const platformOrder = await createPlatformOrder(config, {
      cpOrderId,
      amountCents,
      userId,
      notifyUrl,
      expiresAt,
      locale: parsed.data.locale,
    });
    await updateOrder(cpOrderId, {
      sysOrderId: platformOrder.sys_order_id,
      status: "PENDING",
    });

    return NextResponse.json(
      {
        order: {
          cpOrderId,
          amount: (amountCents / 100).toFixed(2),
          currency: PAYMENT_CURRENCY,
          status: "pending",
          expiresAt: expiresAt.toISOString(),
          fulfilledAt: null,
        },
        paymentPage: {
          sdkSrc: config.paymentSdkSrc,
          clientId: config.clientId,
          sysOrderId: platformOrder.sys_order_id,
          businessType: String(platformOrder.business_type),
          channels: config.channels,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof PaymentPlatformError ||
      error instanceof PaymentConfigurationError
        ? error.message
        : "Unable to create the payment order.";

    await updateOrder(cpOrderId, { status: "FAILED", lastError: message });

    return NextResponse.json(
      {
        error: "PAYMENT_ORDER_CREATE_FAILED",
        message: "Unable to create the payment order.",
      },
      { status: 502 },
    );
  }
}
