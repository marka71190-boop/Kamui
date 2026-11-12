/**
 * Склад: сколько товара реально лежит в наличии.
 *
 * Тираж приходит партиями (например, по 100 шт.), поэтому «в наличии» считается отдельно от остатка тиража на сайте:
 *   В наличии = получено (сумма партий) − продано на сайте (оплаченные заказы из базы) − продано вне сайта.
 * Партии и продажи вне сайта (каждую — с датой и суммой, они же идут в выручку отчёта) продавец вводит на странице /sales. Когда в наличии остаётся не больше порога,
 * сайт один раз пишет продавцу на почту; ещё одно письмо — когда товар закончился. После новой партии
 * предупреждение «взводится» заново.
 */
import { KIT } from "@/config/products";
import { PRODUCT, SELLER } from "@/config/site";
import { sql } from "@/lib/db/pg";
import { getSetting, setSetting } from "@/lib/db/settings";
import { dbEnabled, ensureSchema } from "@/lib/db/schema";
import { mailEnabled, validEmail } from "@/lib/mail/notify";
import { mailFrom, sendMail } from "@/lib/mail/transport";

export interface StockBatch {
  id: number;
  /** «2026-11-01» */
  receivedOn: string;
  qty: number;
  note: string;
}

/** Продажа вне сайта: идёт в выручку отчёта и уменьшает наличие */
export interface OffsiteSale {
  id: number;
  /** «2026-11-01» */
  soldOn: string;
  qty: number;
  /** Получено за эту продажу, ₽ */
  amount: number;
  kit: boolean;
  note: string;
}

export async function offsiteSales(): Promise<OffsiteSale[]> {
  await ensureSchema();
  await migrateOffsiteNumber();
  const r = await sql<{ id: string; d: string; qty: number; amount: string; kit: boolean; note: string }>(
    "select id, to_char(sold_on, 'YYYY-MM-DD') as d, qty, amount, kit, note from offsite_sales order by sold_on desc, id desc",
  );
  return r.rows.map((o) => ({ id: Number(o.id), soldOn: o.d, qty: Number(o.qty), amount: Number(o.amount) || 0, kit: o.kit, note: o.note }));
}

/** Цена по умолчанию, если сумму продажи не указали */
export const defaultOffsiteAmount = (qty: number, kit: boolean) => qty * (kit ? KIT.price : PRODUCT.price);

export async function addOffsiteSale(soldOn: string, qty: number, amount: number, kit: boolean, note: string): Promise<void> {
  await ensureSchema();
  await sql("insert into offsite_sales (sold_on, qty, amount, kit, note) values ($1::date, $2, $3, $4, $5)", [soldOn, qty, amount, kit, note.slice(0, 200)]);
}

export async function deleteOffsiteSale(id: number): Promise<void> {
  await ensureSchema();
  await sql("delete from offsite_sales where id = $1", [id]);
}

/**
 * Раньше «продано вне сайта» было одним числом без даты и суммы. Переносим его в список продаж одной записью
 * (сегодняшней датой, по обычной цене мела), чтобы оно попало в выручку; продавец может её удалить и внести точнее.
 */
async function migrateOffsiteNumber(): Promise<void> {
  const old = int(await getSetting(KEY.offsite), 0);
  if (old <= 0) return;
  await setSetting(KEY.offsite, "0");
  await sql(
    "insert into offsite_sales (sold_on, qty, amount, note) values ((now() at time zone 'Europe/Moscow')::date, $1, $2, $3)",
    [old, defaultOffsiteAmount(old, false), "перенесено из прежнего поля: дата и сумма примерные — удалите и внесите точнее, если нужно"],
  );
}

export interface Warehouse {
  batches: StockBatch[];
  received: number;
  soldSite: number;
  soldOffsite: number;
  onHand: number;
  /** При каком остатке писать на почту */
  threshold: number;
  /** Куда писать */
  email: string;
  /** Какое предупреждение уже отправлено: "" | "low" | "zero" */
  alert: string;
}

const KEY = { offsite: "wh_offsite_sold", threshold: "wh_threshold", email: "wh_alert_email", alert: "wh_alert_level" };
export const DEFAULT_THRESHOLD = 20;

const int = (v: string | null, fallback: number) => {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export async function warehouse(): Promise<Warehouse> {
  await ensureSchema();
  await migrateOffsiteNumber();
  const [b, sold, offsite, threshold, email, alert] = await Promise.all([
    sql<{ id: string; d: string; qty: number; note: string }>(
      "select id, to_char(received_on, 'YYYY-MM-DD') as d, qty, note from stock_batches order by received_on desc, id desc",
    ),
    // В подарочном наборе — один мел, поэтому набор уменьшает наличие так же, как мел
    sql<{ n: string | null }>(
      `select sum(coalesce(nullif(data->>'quantity', '')::numeric, 1)) as n from orders
        where status in ('paid','shipped','delivered') and coalesce(data->'payment'->>'test', 'false') <> 'true'`,
    ),
    sql<{ n: string | null }>("select sum(qty) as n from offsite_sales"),
    getSetting(KEY.threshold),
    getSetting(KEY.email),
    getSetting(KEY.alert),
  ]);
  const batches = b.rows.map((r) => ({ id: Number(r.id), receivedOn: r.d, qty: Number(r.qty), note: r.note }));
  const received = batches.reduce((s, x) => s + x.qty, 0);
  const soldSite = Math.round(Number(sold.rows[0]?.n) || 0);
  const soldOffsite = Math.round(Number(offsite.rows[0]?.n) || 0);
  return {
    batches,
    received,
    soldSite,
    soldOffsite,
    onHand: received - soldSite - soldOffsite,
    threshold: int(threshold, DEFAULT_THRESHOLD),
    email: email && validEmail(email) ? email : SELLER.email,
    alert: alert ?? "",
  };
}

export async function addBatch(receivedOn: string, qty: number, note: string): Promise<void> {
  await ensureSchema();
  await sql("insert into stock_batches (received_on, qty, note) values ($1::date, $2, $3)", [receivedOn, qty, note.slice(0, 200)]);
}

export async function deleteBatch(id: number): Promise<void> {
  await ensureSchema();
  await sql("delete from stock_batches where id = $1", [id]);
}

export async function saveWarehouseSettings(s: { threshold: number; email: string }): Promise<void> {
  await setSetting(KEY.threshold, String(s.threshold));
  await setSetting(KEY.email, s.email);
}

function alertMail(w: Warehouse, zero: boolean) {
  const lines = [
    zero ? "Товар в наличии закончился." : `В наличии осталось ${w.onHand} шт. — это не больше порога ${w.threshold} шт.`,
    "",
    `Получено всего: ${w.received} шт.`,
    `Продано на сайте: ${w.soldSite} шт.`,
    `Продано вне сайта: ${w.soldOffsite} шт.`,
    `В наличии: ${w.onHand} шт.`,
    "",
    "Когда придёт новая партия, добавьте её на странице «Продажи» — предупреждение включится снова.",
  ];
  return {
    subject: zero ? "Kamui: товар в наличии закончился" : `Kamui: в наличии осталось ${w.onHand} шт.`,
    text: lines.join("\n"),
    html: `<div style="font:16px/1.5 Arial,sans-serif;color:#141414">${lines
      .map((l, i) => (l ? `<p style="margin:0 0 6px${i === 0 ? ";font-size:20px;font-weight:bold" : ""}">${l.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!)}</p>` : "<br>"))
      .join("")}</div>`,
  };
}

/** Отправить письмо о складе прямо сейчас (и для проверки, что почта доходит). Бросает ошибку, если не ушло. */
export async function sendStockMail(w: Warehouse, zero = w.onHand <= 0): Promise<void> {
  if (!mailEnabled()) throw new Error("письма не настроены на сервере (SMTP_USER / SMTP_PASSWORD)");
  if (!validEmail(w.email)) throw new Error("не указана почта для предупреждений");
  await sendMail({
    from: { name: process.env.MAIL_FROM_NAME?.trim() || "Abramov Shop", address: mailFrom() },
    to: w.email,
    ...alertMail(w, zero),
  });
}

/**
 * Проверка остатка (раз в 30 минут и после изменений на странице): письмо уходит один раз при переходе
 * через порог и один раз — когда товар закончился. Пока партий нет, склад не ведётся и писем нет.
 */
export async function checkLowStock(): Promise<"sent" | "none"> {
  if (!dbEnabled()) return "none";
  const w = await warehouse();
  if (!w.batches.length) return "none";
  const level = w.onHand <= 0 ? "zero" : w.onHand <= w.threshold ? "low" : "";
  if (level === w.alert) return "none";
  // Наличие выросло (новая партия) — просто «взводим» предупреждение заново
  const worse = level === "zero" || (level === "low" && w.alert === "");
  if (worse) await sendStockMail(w, level === "zero");
  await setSetting(KEY.alert, level);
  return worse ? "sent" : "none";
}
