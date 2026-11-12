/**
 * Сайт → Google Sheets.
 * Заявки уходят в Google Apps Script веб-приложение, привязанное к таблице
 * «Kamui Collection — Заказы» (код скрипта: integrations/google-sheets/apps-script.gs).
 *
 * Российские заявки пишутся на лист «Заказы», международные — на лист «Международные заказы».
 */
import { SITE } from "@/config/site";
import { ORDER_STATUS_LABELS, type Order, type OrderPatch } from "../types";
import type { OrderStore } from "../store";

const TIMEOUT_MS = 25_000;

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

/**
 * Особенность Apps Script: скрипт выполняется на исходном POST-запросе, а результат
 * отдаётся через редирект (302) на script.googleusercontent.com. Поэтому редирект
 * обрабатываем вручную: получили 302 — значит, заявка уже записана в таблицу.
 * Если прочитать ответ после редиректа не удалось, заявку всё равно считаем сохранённой.
 */
async function call(payload: Record<string, unknown>): Promise<SheetsResponse> {
  const { url, secret } = config();
  const res = await fetch(url, {
    method: "POST",
    // text/plain — чтобы Apps Script гарантированно получил тело как строку
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ ...payload, secret }),
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const executed = res.status >= 300 && res.status < 400;
  let response: Response = res;
  if (executed) {
    const location = res.headers.get("location");
    if (!location) throw new Error(`Google Sheets: редирект без адреса (HTTP ${res.status})`);
    try {
      response = await fetch(new URL(location, url), {
        redirect: "follow",
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      console.warn("[sheets] Скрипт выполнен, но ответ не получен:", (err as Error).message);
      return { ok: true, unverified: true };
    }
  }

  const text = await response.text();
  let data: SheetsResponse;
  try {
    data = JSON.parse(text) as SheetsResponse;
  } catch {
    if (executed) {
      console.warn(`[sheets] Скрипт выполнен, ответ не JSON (HTTP ${response.status}): ${text.slice(0, 200)}`);
      return { ok: true, unverified: true };
    }
    throw new Error(
      `Google Sheets: неожиданный ответ (HTTP ${response.status}). Проверьте, что веб-приложение опубликовано с доступом «Все».`,
    );
  }
  if (!data.ok) throw new Error(`Google Sheets: ${data.error ?? "ошибка"}`);
  return data;
}

/** Таблица подключена (есть адрес веб-приложения и секрет) */
export const sheetsConfigured = () => Boolean(process.env.GOOGLE_SHEETS_WEBHOOK_URL && process.env.GOOGLE_SHEETS_SECRET);

export interface SheetMail {
  to: string;
  subject: string;
  text: string;
  html: string;
  from: string;
  fromName: string;
  replyTo?: string;
}

/**
 * Письмо покупателю через скрипт таблицы: он отправляет его из Gmail владельца таблицы
 * от имени shop@abramov.shop (адрес добавлен в Gmail → «Отправлять письма как»).
 * Запасной путь, если хостинг не пускает сайт к почтовому серверу напрямую.
 */
export async function sendMailViaSheet(mail: SheetMail): Promise<void> {
  try {
    await call({ action: "sendMail", mail });
  } catch (err) {
    const msg = (err as Error).message;
    if (/unknown action/.test(msg))
      throw new Error("Gmail: скрипт таблицы старой версии — обновите его (в нём появилась отправка писем)");
    throw new Error(msg.replace(/^Google Sheets:/, "Gmail:"));
  }
}

export function paymentLabel(order: Pick<Order, "payment">): string {
  if (!order.payment) return "";
  if (order.payment.label) return order.payment.label;
  return [order.payment.test ? "ТЕСТ" : "", order.payment.status, order.payment.paymentId].filter(Boolean).join(" · ");
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

/**
 * Запись для листа «Согласия»: кто, когда, с какого IP и на что согласился (в какой редакции текста).
 * Пишется вместе с заказом; старый скрипт таблицы это поле просто пропускает.
 */
export function consentsToRow(order: Order) {
  const c = order.consents;
  if (!c) return undefined;
  return {
    id: order.id,
    createdAt: order.createdAt,
    name: order.customer.name,
    email: order.customer.email,
    phone: order.customer.phone,
    personalData: c.personalData ? "да" : "нет",
    document: `Согласие на обработку персональных данных, редакция от ${c.edition} (${SITE.url}/consent); политика — ${SITE.url}/privacy`,
    orderEmails: c.orderEmails ? "да" : "нет",
    ip: order.meta?.ip ?? "",
    userAgent: order.meta?.userAgent ?? "",
  };
}

export const googleSheetsStore: OrderStore = {
  name: "google-sheets",
  async save(order) {
    await call({ action: "createOrder", sheet: order.region, row: orderToRow(order), consents: consentsToRow(order) });
  },
  async update(id: string, patch: OrderPatch) {
    await call({
      action: "updateOrder",
      id,
      patch: {
        status: patch.status ? ORDER_STATUS_LABELS[patch.status] : undefined,
        delivery: patch.delivery?.label,
        payment: patch.payment ? paymentLabel({ payment: patch.payment }) : undefined,
        emails: patch.mailNote,
      },
    });
  },
};

/** Остаток из листа «Настройки». Apps Script бывает медленным при «холодном» старте — ждём до 20 секунд. */
export async function fetchStockFromSheet(opts: { fresh?: boolean } = {}): Promise<{ total: number; sold: number }> {
  const { url, secret } = config();
  const u = new URL(url);
  u.searchParams.set("action", "stock");
  u.searchParams.set("secret", secret);
  const res = await fetch(u, {
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
    ...(opts.fresh ? { cache: "no-store" as const } : { next: { revalidate: 60 } }),
  });
  const text = await res.text();
  let data: SheetsResponse & { totalStock?: unknown; soldCount?: unknown };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Google Sheets: остаток не прочитан (HTTP ${res.status}): ${text.slice(0, 120)}`);
  }
  const total = Number(data.totalStock);
  const sold = Number(data.soldCount);
  if (!data.ok || !Number.isFinite(total) || !Number.isFinite(sold))
    throw new Error(`Google Sheets: некорректный остаток${data.error ? ` (${data.error})` : ""}`);
  return { total, sold };
}

/** Диагностика чтения остатка для /pay-check: время ответа, коды, начало ответа (без секрета). */
export async function probeSheetStock(): Promise<Record<string, unknown>> {
  const { url, secret } = config();
  const u = new URL(url);
  u.searchParams.set("action", "stock");
  u.searchParams.set("secret", secret);
  const mask = (t: string) => t.split(secret).join("***").slice(0, 200);
  const out: Record<string, unknown> = {};
  let t = Date.now();
  try {
    const r1 = await fetch(u, { redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(25_000) });
    const loc = r1.headers.get("location");
    out.manual = { status: r1.status, ms: Date.now() - t, redirectHost: loc ? new URL(loc, u).host : null };
    if (loc) {
      t = Date.now();
      const r2 = await fetch(new URL(loc, u), { cache: "no-store", signal: AbortSignal.timeout(15_000) });
      out.manualStep2 = { status: r2.status, ms: Date.now() - t, body: mask(await r2.text()) };
    } else {
      out.manualBody = mask(await r1.text());
    }
  } catch (err) {
    out.manualError = { error: `${(err as Error).name}: ${(err as Error).message}`, ms: Date.now() - t };
  }
  t = Date.now();
  try {
    const r = await fetch(u, { redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(25_000) });
    out.follow = { status: r.status, ms: Date.now() - t, body: mask(await r.text()) };
  } catch (err) {
    out.follow = { error: `${(err as Error).name}: ${(err as Error).message}`, ms: Date.now() - t };
  }
  return out;
}

/** Оплаченный заказ с листа «Заказы» (для служебной страницы накладных) */
export interface SheetPaidOrder {
  id: string;
  createdAt: string;
  status: string;
  name: string;
  phone: string;
  email: string;
  quantity: number;
  total: number;
  city: string;
  delivery: string;
  comment: string;
  /** Какие письма покупателю уже ушли (колонки «Письма покупателю» и старые отметки скрипта). Нет поля — скрипт таблицы старый. */
  mailMarks?: string;
  /** Колонка «Платёж»: «Robokassa · оплачено 4 075 ₽ · счёт 123456» */
  payment?: string;
}

/** Номер счёта Robokassa из колонки «Платёж» */
export const robokassaInvoiceFrom = (payment?: string): string | null =>
  /Robokassa.*сч[её]т\s*(\d+)/.exec(payment ?? "")?.[1] ?? null;

export interface SheetOverview {
  paid: SheetPaidOrder[];
  /** Ждут оплаты в Robokassa (null — скрипт таблицы не умеет их отдавать) */
  awaiting: SheetPaidOrder[] | null;
  /** Лист «Международные заказы» (null — скрипт таблицы не умеет их отдавать) */
  intl: SheetPaidOrder[] | null;
}

/**
 * Оплаченные заказы из таблицы за последние days дней.
 * null — скрипт таблицы старой версии (не умеет отдавать заказы) или таблица не настроена.
 */
export async function fetchPaidOrdersFromSheet(days: number): Promise<SheetPaidOrder[] | null> {
  return (await fetchSheetOverview(days, false))?.paid ?? null;
}

/**
 * Оплаченные заказы + (extra) ждущие оплаты в Robokassa и международные — для страницы накладных и сверки оплат.
 * null — таблица не настроена или скрипт старой версии.
 */
export async function fetchSheetOverview(days: number, extra = true): Promise<SheetOverview | null> {
  let url: string, secret: string;
  try {
    ({ url, secret } = config());
  } catch {
    return null;
  }
  const u = new URL(url);
  u.searchParams.set("action", "paidOrders");
  u.searchParams.set("days", String(days));
  if (extra) u.searchParams.set("extra", "1");
  u.searchParams.set("secret", secret);
  const res = await fetch(u, { redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(25_000) });
  const text = await res.text();
  let data: SheetsResponse & { orders?: SheetPaidOrder[]; awaiting?: SheetPaidOrder[]; intl?: SheetPaidOrder[] };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Google Sheets: неожиданный ответ (HTTP ${res.status})`);
  }
  if (!data.ok) throw new Error(`Google Sheets: ${data.error ?? "ошибка"}`);
  if (!Array.isArray(data.orders)) return null;
  return {
    paid: data.orders,
    awaiting: Array.isArray(data.awaiting) ? data.awaiting : null,
    intl: Array.isArray(data.intl) ? data.intl : null,
  };
}
