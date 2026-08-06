import { NextRequest, NextResponse } from "next/server";
import { getPaymentConfig } from "@/lib/payment/config";
import { getOrderByCpOrderId, updateOrder } from "@/lib/payment/orderStore";
import { getPlatformOrder } from "@/lib/payment/starry";
import { centsToAmount } from "@/lib/payment/validation";
import { requireUser } from "@/lib/supabase/guard";

export const runtime = "nodejs";

const statusName = {
  CREATING: "pending",
  PENDING: "pending",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
  EXPIRED: "expired",
} as const;

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ cpOrderId: string }> },
) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;

  const { cpOrderId } = await context.params;
  let order = await getOrderByCpOrderId(cpOrderId);
  if (!order) {
    return NextResponse.json(
      { error: "PAYMENT_ORDER_NOT_FOUND", message: "Payment order not found." },
      { status: 404 },
    );
  }
  // Ownership: real users must match; anonymous (auth off) can read any local e2e order.
  if (auth.userId !== "anonymous" && order.userId !== auth.userId) {
    return NextResponse.json(
      { error: "PAYMENT_ORDER_NOT_FOUND", message: "Payment order not found." },
      { status: 404 },
    );
  }

  if (order.status === "PENDING" && order.sysOrderId) {
    try {
      const config = getPaymentConfig();
      const platformOrder = await getPlatformOrder(config, order.sysOrderId);
      // Observational only — success remains callback-driven.
      if (
        platformOrder.sys_order_id === order.sysOrderId &&
        platformOrder.cp_order_id === order.cpOrderId
      ) {
        const platformStatus =
          typeof platformOrder.status === "number"
            ? platformOrder.status
            : null;
        if (platformStatus === 3 || platformStatus === 5) {
          order =
            (await updateOrder(order.cpOrderId, {
              platformStatus,
              status: platformStatus === 5 ? "EXPIRED" : "FAILED",
            })) ?? order;
        } else if (platformStatus != null) {
          order =
            (await updateOrder(order.cpOrderId, { platformStatus })) ?? order;
        }
      }
    } catch {
      // keep local state
    }
  }

  if (
    order.status === "PENDING" &&
    new Date(order.expiresAt).getTime() <= Date.now()
  ) {
    order =
      (await updateOrder(order.cpOrderId, { status: "EXPIRED" })) ?? order;
  }

  return NextResponse.json({
    order: {
      cpOrderId: order.cpOrderId,
      amount: centsToAmount(order.amountCents),
      currency: order.currency,
      status: statusName[order.status],
      expiresAt: order.expiresAt,
      fulfilledAt: order.fulfilledAt,
      platformStatus: order.platformStatus,
    },
  });
}
