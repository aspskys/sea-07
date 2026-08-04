import { createPublicKey } from "node:crypto";

const DEFAULT_GATEWAY_BASE_URL = "https://publish-gateway.sc-api.saconsole.com";
const DEFAULT_PAYMENT_SDK_SRC =
  "https://seaart-publish.sc-api.saconsole.com/payment-sdk/client.js";

export class PaymentConfigurationError extends Error {
  constructor(readonly missingKeys: string[]) {
    super(`Payment configuration is incomplete: ${missingKeys.join(", ")}`);
    this.name = "PaymentConfigurationError";
  }
}

export type PaymentSecurityConfig = {
  signingKey: string;
  publicKey: string;
  clientId: string;
};

export type PaymentConfig = PaymentSecurityConfig & {
  gatewayBaseUrl: string;
  publicBaseUrl?: string;
  paymentSdkSrc: string;
  productId: string;
  productName: string;
  channels: string[];
  businessTypes: string[];
};

function normalizePem(value: string) {
  return value.replace(/\\n/g, "\n").trim();
}

function requireHttpUrl(value: string, key: string) {
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") return;
  } catch {
    // fall through
  }
  throw new PaymentConfigurationError([`${key} (valid http/https URL required)`]);
}

function splitCsv(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function getPaymentSecurityConfig(): PaymentSecurityConfig {
  const values = {
    signingKey: process.env.PAYMENT_SIGNING_KEY?.trim(),
    publicKey: process.env.PAYMENT_PUBLIC_KEY
      ? normalizePem(process.env.PAYMENT_PUBLIC_KEY)
      : undefined,
    clientId: process.env.PAYMENT_CLIENT_ID?.trim(),
  };
  const missingKeys = Object.entries(values)
    .filter((entry): entry is [string, undefined] => !entry[1])
    .map(
      ([key]) =>
        (
          ({
            signingKey: "PAYMENT_SIGNING_KEY",
            publicKey: "PAYMENT_PUBLIC_KEY",
            clientId: "PAYMENT_CLIENT_ID",
          }) as Record<string, string>
        )[key] ?? key,
    );

  if (missingKeys.length > 0) {
    throw new PaymentConfigurationError(missingKeys);
  }

  try {
    createPublicKey(values.publicKey!);
  } catch {
    throw new PaymentConfigurationError([
      "PAYMENT_PUBLIC_KEY (valid RSA public key required)",
    ]);
  }

  return {
    signingKey: values.signingKey!,
    publicKey: values.publicKey!,
    clientId: values.clientId!,
  };
}

export function getPaymentConfig(): PaymentConfig {
  const securityConfig = getPaymentSecurityConfig();
  const gatewayBaseUrl =
    process.env.PAYMENT_GATEWAY_BASE_URL ?? DEFAULT_GATEWAY_BASE_URL;
  const publicBaseUrl = process.env.PAYMENT_PUBLIC_BASE_URL?.trim();
  const paymentSdkSrc =
    process.env.PAYMENT_SDK_SRC?.trim() || DEFAULT_PAYMENT_SDK_SRC;

  requireHttpUrl(gatewayBaseUrl, "PAYMENT_GATEWAY_BASE_URL");
  requireHttpUrl(paymentSdkSrc, "PAYMENT_SDK_SRC");
  if (publicBaseUrl) requireHttpUrl(publicBaseUrl, "PAYMENT_PUBLIC_BASE_URL");

  return {
    ...securityConfig,
    gatewayBaseUrl: gatewayBaseUrl.replace(/\/$/, ""),
    publicBaseUrl: publicBaseUrl?.replace(/\/$/, ""),
    paymentSdkSrc,
    productId: process.env.PAYMENT_PRODUCT_ID?.trim() || "infiplot_credit",
    productName: process.env.PAYMENT_PRODUCT_NAME?.trim() || "InfiPlot credit",
    channels: splitCsv(process.env.PAYMENT_CHANNELS),
    businessTypes: splitCsv(process.env.PAYMENT_BUSINESS_TYPES),
  };
}

export function resolvePaymentPublicBaseUrl(
  requestUrl: string,
  configuredBaseUrl?: string,
) {
  const value = configuredBaseUrl?.trim() || new URL(requestUrl).origin;
  requireHttpUrl(value, "PAYMENT_PUBLIC_BASE_URL");
  return new URL(value).origin;
}
