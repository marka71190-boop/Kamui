/**
 * ЮKassa — онлайн-оплата (API v3).
 * Документация: https://yookassa.ru/developers/api
 *
 * Включение: PAYMENTS_ENABLED=true + YOOKASSA_SHOP_ID + YOOKASSA_SECRET_KEY (см. .env.example).
 * Сценарий:
 *   1. /api/orders создаёт заказ со статусом «Ожидает оплаты» и платёж (createPayment);
 *   2. покупатель уходит на страницу оплаты ЮKassa (confirmation_url) и возвращается на /?order=<номер>;
 *   3. сайт показывает статус через /api/payments/status (findPaymentForOrder);
 *   4. ЮKassa присылает уведомление на /api/payments/yookassa/webhook;
 *   5. вебхук перепроверяет платёж через API (getPayment), меняет статус заказа
 *      и, если подключён СДЭК, создаёт отправление по данным из metadata платежа.
 */
import { KIT, productName } from "@/config/products";
import { PRODUCT, SITE } from "@/config/site";
import { ORDER_ID_RE } from "@/lib/orders/id";
import type { Order, OrderPayment } from "@/lib/orders/types";

const API = () => (process.env.YOOKASSA_API_URL || "https://api.yookassa.ru/v3").replace(/\/$/, "");

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
  cancellation_details?: { party?: string; reason?: string };
  /** true — платёж тестового магазина */
  test?: boolean;
  /** Сумма возвратов по платежу */
  refunded_amount?: { value: string; currency: string };
}

function authHeader() {
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secret = process.env.YOOKASSA_SECRET_KEY;
  if (!shopId || !secret) throw new Error("ЮKassa не настроена (YOOKASSA_SHOP_ID / YOOKASSA_SECRET_KEY)");
  return "Basic " + Buffer.from(`${shopId}:${secret}`).toString("base64");
}

async function request<T>(
  path: string,
  init: RequestInit & { idempotenceKey?: string; cacheSeconds?: number } = {},
): Promise<T> {
  const { idempotenceKey, cacheSeconds, ...rest } = init;
  const res = await fetch(API() + path, {
    ...rest,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      ...(idempotenceKey ? { "Idempotence-Key": idempotenceKey } : {}),
      ...(rest.headers as Record<string, string> | undefined),
    },
    // cacheSeconds — только для GET-запросов, которые можно кэшировать (остаток на странице)
    ...(cacheSeconds ? { next: { revalidate: cacheSeconds } } : { cache: "no-store" as const }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as T & { type?: string; description?: string };
  if (!res.ok) throw new Error(`ЮKassa ${res.status}: ${data.description ?? "ошибка"}`);
  return data;
}

const money = (n: number) => ({ value: n.toFixed(2), currency: "RUB" });

/** Данные для отправления СДЭК, которые едут в metadata платежа (вебхуку больше неоткуда их взять). */
export interface PaymentShipmentMeta {
  orderId: string;
  /** ИИН / ПИН получателя (Казахстан, Кыргызстан) */
  tin?: string;
  pvz?: string;
  city?: string;
  tariff?: string;
  /** Страна пункта выдачи, если не Россия (BY, KZ, AM, KG) — для международных полей накладной */
  cc?: string;
  /** Текст колонки «Доставка» — чтобы дописать к нему трек-номер */
  delivery?: string;
  /** Подарочный набор: наклейка JOS (у мела — нет) */
  kit?: string;
  qty: string;
  price: string;
  name: string;
  phone: string;
  email: string;
}

/** Данные для накладной СДЭК из заказа (их же передаём в Robokassa, см. robokassa.ts) */
export function paymentMetadataFor(order: Order): PaymentShipmentMeta {
  const c = order.delivery.cdek;
  const meta: PaymentShipmentMeta = {
    orderId: order.id,
    qty: String(order.quantity),
    price: String(order.unitPrice),
    name: order.customer.name.slice(0, 200),
    phone: order.customer.phone.slice(0, 40),
    email: order.customer.email.slice(0, 200),
  };
  if (order.customer.taxId) meta.tin = order.customer.taxId;
  if (order.product === "kit") meta.kit = order.tip || "-";
  if (order.delivery.provider === "cdek" && c?.pickupPointCode) {
    meta.pvz = c.pickupPointCode;
    if (c.cityCode) meta.city = String(c.cityCode);
    if (c.tariffCode) meta.tariff = String(c.tariffCode);
    if (c.countryCode && c.countryCode !== "RU") meta.cc = c.countryCode;
    meta.delivery = order.delivery.label.slice(0, 500);
  }
  return meta;
}

/** Сведения о магазине (GET /me): боевой или тестовый, подключены ли чеки, способы оплаты. */
export interface YooKassaShopInfo {
  account_id: string;
  test: boolean;
  status?: string;
  fiscalization_enabled?: boolean;
  fiscalization?: { enabled?: boolean; provider?: string };
  payment_methods?: string[];
}

let shopCache: { key: string; at: number; info: YooKassaShopInfo } | null = null;

export async function getShopInfo(opts: { fresh?: boolean } = {}): Promise<YooKassaShopInfo> {
  const key = process.env.YOOKASSA_SHOP_ID ?? "";
  if (!opts.fresh && shopCache && shopCache.key === key && Date.now() - shopCache.at < 10 * 60 * 1000) return shopCache.info;
  const info = await request<YooKassaShopInfo>("/me", { method: "GET" });
  shopCache = { key, at: Date.now(), info };
  return info;
}

const METHOD_LABELS: [string, string][] = [
  ["bank_card", "Банковская карта"],
  ["sbp", "СБП"],
  ["sberbank", "SberPay"],
  ["tinkoff_bank", "T-Pay"],
  ["yoo_money", "ЮMoney"],
  ["alfa_pay", "Alfa Pay"],
];

/** Способы оплаты, подключённые в магазине, — для подсказки у кнопки оплаты. */
export async function paymentMethodLabels(): Promise<string[]> {
  try {
    const methods = new Set((await getShopInfo()).payment_methods ?? []);
    return METHOD_LABELS.filter(([code]) => methods.has(code)).map(([, label]) => label);
  } catch {
    return [];
  }
}

/**
 * Отправлять ли чек 54-ФЗ вместе с платежом.
 * YOOKASSA_SEND_RECEIPT=true/false — принудительно; не задано (auto) — если в магазине подключены чеки.
 */
export async function shouldSendReceipt(): Promise<boolean> {
  const mode = (process.env.YOOKASSA_SEND_RECEIPT || "auto").toLowerCase();
  if (mode === "true") return true;
  if (mode === "false") return false;
  try {
    const me = await getShopInfo();
    return Boolean(me.fiscalization?.enabled ?? me.fiscalization_enabled);
  } catch (err) {
    console.warn("[yookassa] Не удалось узнать настройки чеков:", (err as Error).message);
    return false;
  }
}

function receiptFor(order: Order) {
  const vat = Number(process.env.YOOKASSA_VAT_CODE || 1); // 1 — без НДС
  const items: Record<string, unknown>[] = [
    {
      description: (order.product === "kit" ? productName("kit", order.tip) : PRODUCT.name).slice(0, 128),
      quantity: order.quantity,
      amount: money(order.unitPrice),
      vat_code: vat,
      payment_mode: "full_payment",
      payment_subject: "commodity",
    },
  ];
  if (order.deliveryCost > 0) {
    items.push({
      description: "Доставка СДЭК до пункта выдачи",
      quantity: 1,
      amount: money(order.deliveryCost),
      vat_code: vat,
      payment_mode: "full_payment",
      payment_subject: "service",
    });
  }
  const receipt: Record<string, unknown> = {
    customer: { email: order.customer.email, phone: order.customer.phone.replace(/\D/g, "") },
    items,
  };
  const tax = Number(process.env.YOOKASSA_TAX_SYSTEM_CODE || 0);
  if (tax) receipt.tax_system_code = tax;
  return receipt;
}

/**
 * Адрес сайта, с которого пришёл покупатель: основной домен или адрес на vercel.app
 * (пока домен не подключён). Чужие адреса не принимаем — используем основной.
 */
export function siteOriginFor(request: Request): string {
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").split(",")[0].trim().toLowerCase();
  const own = new URL(SITE.url).host;
  // Свой домен, адреса Vercel и технический домен Timeweb Cloud (для проверки до переключения домена)
  if (host === own || host === `www.${own}` || /^kamui[a-z0-9-]*\.vercel\.app$/.test(host) || /^[a-z0-9-]+\.twc1\.net$/.test(host))
    return `https://${host}`;
  return SITE.url;
}

export function returnUrlFor(orderId: string, origin: string = SITE.url) {
  return process.env.YOOKASSA_RETURN_URL
    ? process.env.YOOKASSA_RETURN_URL.replace("{order}", encodeURIComponent(orderId))
    : `${origin}/?order=${encodeURIComponent(orderId)}#buy`;
}

/** Создаёт платёж для заказа и возвращает ссылку на оплату. */
export async function createPayment(
  order: Order,
  opts: { origin?: string } = {},
): Promise<{ paymentId: string; confirmationUrl: string; status: YooKassaPaymentStatus; test: boolean }> {
  const body: Record<string, unknown> = {
    amount: money(order.total),
    capture: true,
    confirmation: { type: "redirect", return_url: returnUrlFor(order.id, opts.origin), locale: "ru_RU" },
    description: `Заказ ${order.id}: ${order.product === "kit" ? `${KIT.shortName} (JOS ${order.tip})` : PRODUCT.shortName} × ${order.quantity}`.slice(0, 128),
    metadata: paymentMetadataFor(order),
  };

  // Чек по 54-ФЗ — если в личном кабинете ЮKassa подключены «Чеки от ЮKassa» или своя онлайн-касса.
  if (await shouldSendReceipt()) body.receipt = receiptFor(order);

  const payment = await request<YooKassaPayment>("/payments", {
    method: "POST",
    body: JSON.stringify(body),
    idempotenceKey: `order-${order.id}`,
  });
  const url = payment.confirmation?.confirmation_url;
  if (!url) throw new Error("ЮKassa не вернула ссылку на оплату");
  return { paymentId: payment.id, confirmationUrl: url, status: payment.status, test: payment.test === true };
}

/** Получает актуальный статус платежа (используется для проверки вебхука). */
export function getPayment(paymentId: string): Promise<YooKassaPayment> {
  return request<YooKassaPayment>(`/payments/${encodeURIComponent(paymentId)}`, { method: "GET" });
}

/**
 * Находит последний платёж по номеру заказа среди платежей за последние дни.
 * Нужен, когда покупатель вернулся со страницы оплаты: базы данных у сайта нет,
 * поэтому ищем прямо в ЮKassa по metadata.orderId.
 */
export async function findPaymentForOrder(orderId: string, days = 3): Promise<YooKassaPayment | null> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  let cursor: string | undefined;
  for (let page = 0; page < 5; page++) {
    const q = new URLSearchParams({ "created_at.gte": since, limit: "100" });
    if (cursor) q.set("cursor", cursor);
    const data = await request<{ items: YooKassaPayment[]; next_cursor?: string }>(`/payments?${q}`, {
      method: "GET",
    });
    const found = data.items
      .filter((p) => p.metadata?.orderId === orderId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    if (found) return found;
    if (!data.next_cursor) return null;
    cursor = data.next_cursor;
  }
  return null;
}

/**
 * Успешные боевые платежи за заказы сайта за последние days дней — новые сверху.
 * Нужны странице /cdek-orders: видно, у каких оплаченных заказов нет накладной СДЭК.
 */
export async function listPaidSiteOrders(days = 14): Promise<YooKassaPayment[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const out: YooKassaPayment[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    const q = new URLSearchParams({ status: "succeeded", "created_at.gte": since, limit: "100" });
    if (cursor) q.set("cursor", cursor);
    const data = await request<{ items?: YooKassaPayment[]; next_cursor?: string }>(`/payments?${q}`, { method: "GET" });
    for (const p of data.items ?? []) {
      if (p.status === "succeeded" && !p.test && ORDER_ID_RE.test(p.metadata?.orderId ?? "")) out.push(p);
    }
    if (!data.next_cursor) break;
    cursor = data.next_cursor;
  }
  return out.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Тело уведомления ЮKassa */
/**
 * Сколько штук оплачено на сайте: сумма количества по успешным платежам ЮKassa за заказы сайта.
 * Платежи тестового магазина и полностью возвращённые платежи не считаются.
 * Начало отсчёта — STOCK_COUNT_SINCE (ISO-дата), по умолчанию 1 сентября 2026.
 */
export async function paidQuantity(opts: { fresh?: boolean } = {}): Promise<{ quantity: number; payments: number }> {
  const since = new Date(process.env.STOCK_COUNT_SINCE || "2026-09-01T00:00:00+03:00");
  const sinceIso = Number.isNaN(since.getTime()) ? "2026-09-01T00:00:00.000Z" : since.toISOString();
  let quantity = 0;
  let payments = 0;
  let cursor: string | undefined;
  for (let page = 0; page < 30; page++) {
    const q = new URLSearchParams({ status: "succeeded", "created_at.gte": sinceIso, limit: "100" });
    if (cursor) q.set("cursor", cursor);
    const data = await request<{ items?: YooKassaPayment[]; next_cursor?: string }>(`/payments?${q}`, {
      method: "GET",
      cacheSeconds: opts.fresh ? undefined : 60,
    });
    for (const p of data.items ?? []) {
      if (p.status !== "succeeded" || p.test) continue;
      if (!ORDER_ID_RE.test(p.metadata?.orderId ?? "")) continue; // платёж не с этого сайта
      const qty = Number.parseInt(p.metadata?.qty ?? "", 10);
      if (!(qty > 0)) continue;
      const refunded = Number(p.refunded_amount?.value ?? 0);
      if (refunded > 0 && refunded >= Number(p.amount.value)) continue; // деньги вернули полностью
      quantity += qty;
      payments += 1;
    }
    if (!data.next_cursor) break;
    cursor = data.next_cursor;
  }
  return { quantity, payments };
}

export interface YooKassaNotification {
  type: "notification";
  event: "payment.succeeded" | "payment.waiting_for_capture" | "payment.canceled" | "refund.succeeded" | string;
  object: { id: string; status?: string; metadata?: Record<string, string> };
}
