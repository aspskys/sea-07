import {
  constants,
  createHash,
  createVerify,
  publicEncrypt,
  randomUUID,
} from "node:crypto";
import type { PaymentConfig } from "./config";

const XH_OS = "node";
const XH_SDK_VERSION = "3.4.0";
export const PAYMENT_SIGN_VERSION = "3.0.1";

export class PaymentPlatformError extends Error {
  constructor(
    readonly code: number | string,
    message: string,
  ) {
    super(message);
    this.name = "PaymentPlatformError";
  }
}

export function createRequestId() {
  return randomUUID().replaceAll("-", "");
}

export function createPlatformRequestSignature(input: {
  body: string;
  queryString?: string;
  key: string;
  publicKey: string;
  requestId: string;
}) {
  const source = [
    XH_OS,
    XH_SDK_VERSION,
    PAYMENT_SIGN_VERSION,
    input.key,
    input.requestId,
    input.queryString ?? "",
    input.body,
  ].join("");
  const digest = createHash("sha256").update(source).digest();

  return publicEncrypt(
    {
      key: input.publicKey,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha1",
    },
    digest,
  ).toString("base64");
}

export function verifyPlatformCallbackSignature(input: {
  rawBody: string;
  signVersion: string;
  key: string;
  requestId: string;
  signature: string;
  publicKey: string;
}) {
  if (input.signVersion !== PAYMENT_SIGN_VERSION) return false;

  const verifier = createVerify("RSA-SHA256");
  verifier.update(
    `${input.signVersion}${input.key}${input.requestId}${input.rawBody}`,
  );
  verifier.end();

  return verifier.verify(
    input.publicKey,
    Buffer.from(input.signature, "base64"),
  );
}

type PlatformEnvelope = {
  code: number;
  message?: string;
  request_id?: string;
  data?: unknown;
};

async function postPlatform(
  config: PaymentConfig,
  path: string,
  body: Record<string, unknown>,
) {
  const rawBody = JSON.stringify(body);
  const requestId = createRequestId();
  const signature = createPlatformRequestSignature({
    body: rawBody,
    key: config.signingKey,
    publicKey: config.publicKey,
    requestId,
  });
  let response: Response;

  try {
    response = await fetch(`${config.gatewayBaseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Xh-Os": XH_OS,
        "Xh-Sdk-Version": XH_SDK_VERSION,
        "Sign-Version": PAYMENT_SIGN_VERSION,
        "Request-Id": requestId,
        Key: config.signingKey,
        Sign: signature,
      },
      body: rawBody,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new PaymentPlatformError(
      "NETWORK_ERROR",
      error instanceof Error ? error.message : "Payment gateway request failed.",
    );
  }

  const rawResponse = await response.text();
  let parsedResponse: unknown;
  try {
    parsedResponse = JSON.parse(rawResponse);
  } catch {
    throw new PaymentPlatformError(
      response.status,
      "Payment gateway returned an invalid response.",
    );
  }

  const platformResponse = parsedResponse as PlatformEnvelope;
  if (
    typeof platformResponse !== "object" ||
    platformResponse === null ||
    typeof platformResponse.code !== "number"
  ) {
    throw new PaymentPlatformError(
      response.status,
      "Payment gateway response did not match the documented schema.",
    );
  }

  if (!response.ok || platformResponse.code !== 20000) {
    throw new PaymentPlatformError(
      platformResponse.code,
      platformResponse.message || "Payment gateway rejected the request.",
    );
  }

  return platformResponse.data;
}

export async function createPlatformOrder(
  config: PaymentConfig,
  input: {
    cpOrderId: string;
    amountCents: number;
    userId: string;
    notifyUrl: string;
    expiresAt: Date;
    locale: string;
  },
) {
  const data = await postPlatform(config, "/open_api/payment/create_order", {
    cp_order_id: input.cpOrderId,
    price: input.amountCents / 100,
    currency: "USD",
    notify_url: input.notifyUrl,
    product_id: config.productId,
    product_name: config.productName,
    cp_account_id: input.userId,
    cp_payload: input.cpOrderId,
    language_code: input.locale,
    expire_time_ms: input.expiresAt.getTime(),
    usd_price: input.amountCents / 100,
    // one_time — matches SeaInfra business_types=["one_time"]
    business_type: 1,
  });

  if (!data || typeof data !== "object") {
    throw new PaymentPlatformError(
      "INVALID_CREATE_ORDER_RESPONSE",
      "Payment gateway omitted the platform order ID.",
    );
  }
  const record = data as Record<string, unknown>;
  const sysOrderId =
    typeof record.sys_order_id === "string" ? record.sys_order_id : "";
  const businessType =
    typeof record.business_type === "number" ? record.business_type : 1;
  if (!sysOrderId || sysOrderId.length > 60) {
    throw new PaymentPlatformError(
      "INVALID_CREATE_ORDER_RESPONSE",
      "Payment gateway omitted the platform order ID.",
    );
  }

  return { sys_order_id: sysOrderId, business_type: businessType };
}

export async function getPlatformOrder(
  config: PaymentConfig,
  sysOrderId: string,
) {
  const data = await postPlatform(config, "/open_api/payment/order/info", {
    sys_order_id: sysOrderId,
  });
  if (!data || typeof data !== "object") {
    throw new PaymentPlatformError(
      "INVALID_ORDER_INFO_RESPONSE",
      "Payment gateway returned invalid order information.",
    );
  }
  const orderInfo = (data as { order_info?: Record<string, unknown> })
    .order_info;
  if (!orderInfo || typeof orderInfo.sys_order_id !== "string") {
    throw new PaymentPlatformError(
      "INVALID_ORDER_INFO_RESPONSE",
      "Payment gateway returned invalid order information.",
    );
  }
  return orderInfo;
}
