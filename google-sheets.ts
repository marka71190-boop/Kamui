/**
 * Сайт → Google Sheets.
 * Заявки уходят в Google Apps Script веб-приложение, привязанное к таблице
 * «Kamui Collection — Заказы» (код скрипта: integrations/google-sheets/apps-script.gs).
 *
 * Российские заявки пишутся на лист «Заказы», международные — на лист «Международные заказы».
 */
import { ORDER_STATUS_LABELS, type Order, type OrderPatch } from "../types";
import type { OrderStore } from "../store";

const TIMEOUT_MS = 15_000;

function config() {
  const url = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  const secret = process.env.GOOGLE_SHEETS_SECRET;
  if (!url || !secret) throw new Error("Google Sheets не настроен (GOOGLE_SHEETS_WEBHOOK_URL / GOOGLE_SHEETS_SECRET)");
  return { url, secret };
}

interface SheetsResponse {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

async function call(payload: Record<string, unknown>): Promise<SheetsResponse> {
  const { url, secret } = config();
  const res = await fetch(url, {
    method: "POST",
    // text/plain — чтобы Apps Script гарантированно получил тело как строку
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ ...payload, secret }),
    redirect: "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  let data: SheetsResponse;
  try {
    data = JSON.parse(text) as SheetsResponse;
  } catch {
    throw new Error(
      `Google Sheets: неожиданный ответ (HTTP ${res.status}). Проверьте, что веб-приложение опубликовано с доступом «Все».`,
    );
  }
  if (!data.ok) throw new Error(`Google Sheets: ${data.error ?? "ошибка"}`);
  return data;
}

function paymentLabel(order: Pick<Order, "payment">): string {
  if (!order.payment) return "";
  return [order.payment.status, order.payment.paymentId].filter(Boolean).join(" · ");
}

/** Строка таблицы. Названия ключей совпадают с теми, что ждёт Apps Script. */
export function orderToRow(order: Order) {
  return {
    id: order.id,
    createdAt: order.createdAt,
    status: ORDER_STATUS_LABELS[order.status],
    name: order.customer.name,
    phone: order.customer.phone,
    email: order.customer.email,
    quantity: order.quantity,
    total: order.total,
    country: order.address.country,
    city: order.address.city,
    postalCode: order.address.postalCode ?? "",
    address: order.address.address ?? "",
    delivery: order.delivery.label,
    comment: order.comment,
    payment: paymentLabel(order),
  };
}

export const googleSheetsStore: OrderStore = {
  name: "google-sheets",
  async save(order) {
    await call({ action: "createOrder", sheet: order.region, row: orderToRow(order) });
  },
  async update(id: string, patch: OrderPatch) {
    await call({
      action: "updateOrder",
      id,
      patch: {
        status: patch.status ? ORDER_STATUS_LABELS[patch.status] : undefined,
        delivery: patch.delivery?.label,
        payment: patch.payment ? paymentLabel({ payment: patch.payment }) : undefined,
      },
    });
  },
};

/** Остаток из листа «Настройки». */
export async function fetchStockFromSheet(opts: { fresh?: boolean } = {}): Promise<{ total: number; sold: number }> {
  const { url, secret } = config();
  const u = new URL(url);
  u.searchParams.set("action", "stock");
  u.searchParams.set("secret", secret);
  const res = await fetch(u, {
    redirect: "follow",
    signal: AbortSignal.timeout(5_000),
    ...(opts.fresh ? { cache: "no-store" as const } : { next: { revalidate: 60 } }),
  });
  const data = (await res.json()) as SheetsResponse & { totalStock?: unknown; soldCount?: unknown };
  const total = Number(data.totalStock);
  const sold = Number(data.soldCount);
  if (!data.ok || !Number.isFinite(total) || !Number.isFinite(sold))
    throw new Error("Google Sheets: некорректный остаток");
  return { total, sold };
}
