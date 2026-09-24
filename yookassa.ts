/**
 * ЮKassa — заготовка под онлайн-оплату (API v3).
 * Документация: https://yookassa.ru/developers/api
 *
 * Включение: PAYMENTS_ENABLED=true + YOOKASSA_SHOP_ID + YOOKASSA_SECRET_KEY (см. .env.example).
 * Сценарий:
 *   1. /api/orders создаёт заказ со статусом «Ожидает оплаты» и платёж (createPayment);
 *   2. покупатель уходит на страницу оплаты ЮKassa (confirmation_url);
 *   3. ЮKassa присылает уведомление на /api/payments/yookassa/webhook;
 *   4. вебхук перепроверяет платёж через API (getPayment) и меняет статус заказа.
 */
import { PRODUCT, SITE } from "@/config/site";
import type { Order, OrderPayment } from "@/lib/orders/types";

const API = "https://api.yookassa.ru/v3";

export type YooKassaPaymentStatus = OrderPayment["status"];

export interface YooKassaPayment {
  id: string;
  status: YooKassaPaymentStatus;
  paid: boolean;
  amount: { value: string; currency: string };
  confirmation?: { type: string; confirmation_url?: string };
  metadata?: Record<string, string>;
  captured_at?: string;
  created_at: string;
}

function authHeader() {
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secret = process.env.YOOKASSA_SECRET_KEY;
  if (!shopId || !secret) throw new Error("ЮKassa не настроена (YOOKASSA_SHOP_ID / YOOKASSA_SECRET_KEY)");
  return "Basic " + Buffer.from(`${shopId}:${secret}`).toString("base64");
}

async function request<T>(path: string, init: RequestInit & { idempotenceKey?: string } = {}): Promise<T> {
  const { idempotenceKey, ...rest } = init;
  const res = await fetch(API + path, {
    ...rest,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      ...(idempotenceKey ? { "Idempotence-Key": idempotenceKey } : {}),
      ...(rest.headers as Record<string, string> | undefined),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json()) as T & { type?: string; description?: string };
  if (!res.ok) throw new Error(`ЮKassa ${res.status}: ${data.description ?? "ошибка"}`);
  return data;
}

const money = (n: number) => ({ value: n.toFixed(2), currency: "RUB" });

/** Создаёт платёж для заказа и возвращает ссылку на оплату. */
export async function createPayment(
  order: Order,
): Promise<{ paymentId: string; confirmationUrl: string; status: YooKassaPaymentStatus }> {
  const returnUrl = process.env.YOOKASSA_RETURN_URL || `${SITE.url}/?order=${encodeURIComponent(order.id)}#buy`;

  const body: Record<string, unknown> = {
    amount: money(order.total),
    capture: true,
    confirmation: { type: "redirect", return_url: returnUrl },
    description: `Заказ ${order.id}: ${PRODUCT.shortName} × ${order.quantity}`.slice(0, 128),
    metadata: { orderId: order.id },
  };

  // Чек по 54-ФЗ — если в личном кабинете ЮKassa подключены «Чеки от ЮKassa».
  if (process.env.YOOKASSA_SEND_RECEIPT === "true") {
    body.receipt = {
      customer: { email: order.customer.email, phone: order.customer.phone.replace(/\D/g, "") },
      items: [
        {
          description: PRODUCT.name.slice(0, 128),
          quantity: order.quantity,
          amount: money(order.unitPrice),
          vat_code: Number(process.env.YOOKASSA_VAT_CODE || 1), // 1 — без НДС
          payment_mode: "full_payment",
          payment_subject: "commodity",
        },
      ],
    };
  }

  const payment = await request<YooKassaPayment>("/payments", {
    method: "POST",
    body: JSON.stringify(body),
    idempotenceKey: `order-${order.id}`,
  });
  const url = payment.confirmation?.confirmation_url;
  if (!url) throw new Error("ЮKassa не вернула ссылку на оплату");
  return { paymentId: payment.id, confirmationUrl: url, status: payment.status };
}

/** Получает актуальный статус платежа (используется для проверки вебхука). */
export function getPayment(paymentId: string): Promise<YooKassaPayment> {
  return request<YooKassaPayment>(`/payments/${encodeURIComponent(paymentId)}`, { method: "GET" });
}

/** Тело уведомления ЮKassa */
export interface YooKassaNotification {
  type: "notification";
  event: "payment.succeeded" | "payment.waiting_for_capture" | "payment.canceled" | "refund.succeeded" | string;
  object: { id: string; status?: string; metadata?: Record<string, string> };
}
