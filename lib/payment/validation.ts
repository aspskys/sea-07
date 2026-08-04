export const PAYMENT_CURRENCY = "USD";
export const PAYMENT_MIN_AMOUNT_CENTS = 100;
export const PAYMENT_MAX_AMOUNT_CENTS = 999_999;

const LOCALES = new Set(["en", "zh-CN", "ja"]);

export type CreatePaymentOrderInput = {
  amount: string;
  note: string;
  locale: "en" | "zh-CN" | "ja";
};

export function parseCreatePaymentOrderInput(
  raw: unknown,
): { ok: true; data: CreatePaymentOrderInput } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "body must be an object" };
  }
  const body = raw as Record<string, unknown>;
  const amount = typeof body.amount === "string" ? body.amount.trim() : "";
  if (!/^\d{1,4}(?:\.\d{1,2})?$/.test(amount)) {
    return { ok: false, error: "invalid amount" };
  }
  const note =
    typeof body.note === "string" ? body.note.trim().slice(0, 255) : "";
  const localeRaw = typeof body.locale === "string" ? body.locale : "en";
  if (!LOCALES.has(localeRaw)) {
    return { ok: false, error: "invalid locale" };
  }
  return {
    ok: true,
    data: {
      amount,
      note,
      locale: localeRaw as CreatePaymentOrderInput["locale"],
    },
  };
}

export function amountToCents(amount: string) {
  const [wholePart, decimalPart = ""] = amount.split(".");
  const cents =
    Number(wholePart) * 100 + Number(decimalPart.padEnd(2, "0"));

  if (
    !Number.isSafeInteger(cents) ||
    cents < PAYMENT_MIN_AMOUNT_CENTS ||
    cents > PAYMENT_MAX_AMOUNT_CENTS
  ) {
    return null;
  }

  return cents;
}

export function centsToAmount(cents: number) {
  return (cents / 100).toFixed(2);
}
