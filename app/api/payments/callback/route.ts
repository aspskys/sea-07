import { NextRequest, NextResponse } from "next/server";
import { processPaymentCallback } from "@/lib/payment/callbackProcess";
import { isPaymentSandboxSimulateEnabled } from "@/lib/payment/sandbox";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const result = await processPaymentCallback({
    rawBody,
    signVersion: request.headers.get("sign-version") ?? "",
    key: request.headers.get("key") ?? "",
    requestId: request.headers.get("request-id") ?? "",
    signature: request.headers.get("sign") ?? "",
    allowSandbox:
      isPaymentSandboxSimulateEnabled() &&
      request.headers.get("x-payment-sandbox") === "1",
  });

  return NextResponse.json(
    { code: result.code, message: result.message, data: null },
    { status: result.httpStatus },
  );
}
