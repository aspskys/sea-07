/**
 * Pre-formal payment order store (filesystem).
 *
 * Suitable for single-node local/dev. Multi-instance production should move
 * to a shared DB (Supabase migration or demox PG) before go-live.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type PaymentOrderStatus =
  | "CREATING"
  | "PENDING"
  | "SUCCEEDED"
  | "FAILED"
  | "EXPIRED";

export type PaymentOrderRecord = {
  id: string;
  cpOrderId: string;
  sysOrderId: string | null;
  userId: string;
  amountCents: number;
  currency: string;
  note: string | null;
  status: PaymentOrderStatus;
  platformStatus: number | null;
  lastEventTimeMs: number | null;
  expiresAt: string;
  fulfilledAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  processedEventIds: string[];
};

const ROOT = path.join(process.cwd(), ".data", "payment-orders");

async function ensureRoot() {
  await mkdir(ROOT, { recursive: true });
}

function orderPath(cpOrderId: string) {
  const safe = cpOrderId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(ROOT, `${safe}.json`);
}

async function writeAtomic(file: string, data: PaymentOrderRecord) {
  await ensureRoot();
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await rename(tmp, file);
}

export async function createOrder(
  input: Omit<
    PaymentOrderRecord,
    | "id"
    | "sysOrderId"
    | "status"
    | "platformStatus"
    | "lastEventTimeMs"
    | "fulfilledAt"
    | "lastError"
    | "createdAt"
    | "updatedAt"
    | "processedEventIds"
  >,
): Promise<PaymentOrderRecord> {
  const now = new Date().toISOString();
  const record: PaymentOrderRecord = {
    id: input.cpOrderId,
    cpOrderId: input.cpOrderId,
    sysOrderId: null,
    userId: input.userId,
    amountCents: input.amountCents,
    currency: input.currency,
    note: input.note,
    status: "CREATING",
    platformStatus: null,
    lastEventTimeMs: null,
    expiresAt: input.expiresAt,
    fulfilledAt: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
    processedEventIds: [],
  };
  await writeAtomic(orderPath(record.cpOrderId), record);
  return record;
}

export async function getOrderByCpOrderId(
  cpOrderId: string,
): Promise<PaymentOrderRecord | null> {
  try {
    const raw = await readFile(orderPath(cpOrderId), "utf8");
    return JSON.parse(raw) as PaymentOrderRecord;
  } catch {
    return null;
  }
}

export async function updateOrder(
  cpOrderId: string,
  patch: Partial<PaymentOrderRecord>,
): Promise<PaymentOrderRecord | null> {
  const current = await getOrderByCpOrderId(cpOrderId);
  if (!current) return null;
  const next: PaymentOrderRecord = {
    ...current,
    ...patch,
    cpOrderId: current.cpOrderId,
    id: current.id,
    updatedAt: new Date().toISOString(),
  };
  await writeAtomic(orderPath(cpOrderId), next);
  return next;
}
