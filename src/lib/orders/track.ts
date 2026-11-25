/**
 * Статус заказа для покупателя (страница /order и блок «Где мой заказ» на главной):
 * по номеру заказа или по номеру телефона из заказа.
 * Отдаём только то, что нужно для отслеживания, — без ФИО, контактов и адреса пункта выдачи.
 */
import { features } from "@/config/features";
import { orderTipKinds } from "@/lib/payments/yookassa";
import { tipsFromNote, tipsText } from "@/config/products";
import { sql } from "@/lib/db/pg";
import { dbEnabled, ensureSchema } from "@/lib/db/schema";
import { AT_PICKUP_CODES } from "@/lib/delivery/cdek";
import { shipmentFor } from "./flags";
import { ordersOverview } from "./repo";
import type { Order, OrderStatus } from "./types";

/** 0 — оформлен, 1 — оплачен, 2 — собран, 3 — передан в СДЭК, 4 — ждёт в пункте выдачи, 5 — получен */
export type TrackStep = 0 | 1 | 2 | 3 | 4 | 5;

export interface TrackView {
  id: string;
  createdAt: string;
  step: TrackStep;
  /** Заказ или оплата отменены */
  canceled: boolean;
  /** Доставка не СДЭК (другая страна) — этапы не показываем, только статус */
  manual: boolean;
  quantity: number;
  kit: boolean;
  /** Докупленные наклейки JOS: «PM × 2, H × 1» (пусто — нет) */
  tips: string;
  total: number;
  delivery: string;
  tracking?: string;
  /** Последний статус посылки по данным СДЭК */
  cdekStatus?: string;
  /** До какого числа посылка бесплатно хранится в пункте выдачи */
  keepFreeUntil?: string;
}

const digits = (s: string) => s.replace(/\D/g, "");

/** Почта совпадает целиком, телефон — по последним 10 цифрам */
function contactMatches(contact: string, email: string, phone: string): boolean {
  const c = contact.trim().toLowerCase();
  if (c.includes("@")) return c === email.trim().toLowerCase();
  const d = digits(c);
  return d.length >= 10 && digits(phone).endsWith(d.slice(-10));
}

const cleanLabel = (label: string) => label.replace(/ · трек .*$/, "").replace(/ · ⚠.*$/, "").trim();

/** Накладная создаётся сразу после оплаты, поэтому сам трек-номер ещё не значит, что посылку сдали в СДЭК */
function stepOf(status: string, packed: boolean): TrackStep {
  if (status === "delivered" || status === "Доставлена") return 5;
  if (status === "shipped" || status === "Отправлена") return 3;
  if (status === "paid" || status === "Оплачена") return packed ? 2 : 1;
  return 0;
}

interface Row {
  id: string;
  created_at: string;
  status: OrderStatus;
  email: string;
  phone: string;
  total: string;
  data: Order;
  tracking: string | null;
  manual_tracking: string | null;
  packed_at: string | null;
}

/** Сколько заказов показываем по одному телефону (самые новые) */
const MAX_BY_PHONE = 5;

/** Последние 10 цифр телефона — так «8 900…», «+7 900…» и «900…» считаются одним номером */
export const phoneKey = (s: string): string => digits(s).slice(-10);

/**
 * Что ввели в поле поиска: номер заказа (KA-260925-AB12, регистр и пробелы неважны) или телефон (от 10 цифр).
 * null — ни то ни другое.
 */
export function parseTrackQuery(raw: string): { kind: "id"; id: string } | { kind: "phone"; key: string } | null {
  const q = String(raw ?? "").trim().toUpperCase().replace(/\s+/g, "").replace(/^KA(\d)/, "KA-$1");
  const id = /^KA-?(\d{6})-?([A-Z0-9]{4})$/.exec(q);
  if (id) return { kind: "id", id: `KA-${id[1]}-${id[2]}` };
  const d = digits(q);
  if (d.length >= 10 && d.length <= 15 && !/[A-Z]/.test(q)) return { kind: "phone", key: d.slice(-10) };
  return null;
}

function viewFromRow(r: Row): TrackView {
  const d = r.data;
  const tracking = r.tracking || d.delivery?.cdek?.trackingNumber || r.manual_tracking || undefined;
  return {
    id: r.id,
    createdAt: r.created_at,
    step: stepOf(r.status, Boolean(r.packed_at)),
    canceled: r.status === "cancelled" || r.status === "payment_canceled",
    manual: d.delivery?.provider !== "cdek",
    quantity: Number(d.quantity) || 1,
    tips: tipsText(orderTipKinds(d)),
    kit: d.product === "kit",
    total: Math.round(Number(r.total) || 0),
    delivery: cleanLabel(d.delivery?.label ?? ""),
    ...(tracking ? { tracking } : {}),
  };
}

const COLS = `o.id, o.created_at, o.status, o.email, o.phone, o.total, o.data, o.tracking, f.manual_tracking, f.packed_at
  from orders o left join order_flags f on f.order_id = o.id`;

async function fromDb(id: string, contact: string): Promise<TrackView | null> {
  await ensureSchema();
  const r = (await sql<Row>(`select ${COLS} where o.id = $1`, [id])).rows[0];
  if (!r || (contact && !contactMatches(contact, r.email, r.phone))) return null;
  return viewFromRow(r);
}

async function fromDbByPhone(key: string): Promise<TrackView[]> {
  await ensureSchema();
  const r = await sql<Row>(
    `select ${COLS} where right(regexp_replace(o.phone, '\\D', '', 'g'), 10) = $1 order by o.created_at desc limit ${MAX_BY_PHONE}`,
    [key],
  );
  return r.rows.map(viewFromRow);
}

/** Без базы — из Google Таблицы (заказы за последние 90 дней) */
async function sheetOrders() {
  const ov = await ordersOverview(90, true);
  return [...(ov?.paid ?? []), ...(ov?.awaiting ?? []), ...(ov?.intl ?? [])];
}

function viewFromSheet(o: Awaited<ReturnType<typeof sheetOrders>>[number]): TrackView {
  const tracking = / · трек (\d{6,14})/.exec(o.delivery)?.[1];
  return {
    id: o.id,
    createdAt: o.createdAt,
    step: stepOf(o.status, false),
    canceled: /отмен/i.test(o.status),
    manual: !/^СДЭК/.test(o.delivery),
    quantity: o.quantity || 1,
    tips: tipsText(tipsFromNote(o.comment)),
    kit: /^Подарочный набор/.test(o.comment),
    total: Math.round(o.total || 0),
    delivery: cleanLabel(o.delivery),
    ...(tracking ? { tracking } : {}),
  };
}

async function fromSheet(id: string, contact: string): Promise<TrackView | null> {
  const o = (await sheetOrders()).find((x) => x.id === id);
  if (!o || (contact && !contactMatches(contact, o.email, o.phone))) return null;
  return viewFromSheet(o);
}

async function fromSheetByPhone(key: string): Promise<TrackView[]> {
  const seen = new Set<string>();
  return (await sheetOrders())
    .filter((o) => phoneKey(o.phone) === key && !seen.has(o.id) && seen.add(o.id))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, MAX_BY_PHONE)
    .map(viewFromSheet);
}

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([p, new Promise<null>((res) => setTimeout(() => res(null), ms))]);

/** Оплаченный заказ: уточняем у СДЭК, где посылка (не дольше нескольких секунд — иначе покажем то, что знаем сами) */
async function withCdek(view: TrackView): Promise<TrackView> {
  if (view.canceled || view.manual || view.step === 0 || view.step === 5 || !features.cdek) return view;
  try {
    const s = await withTimeout(shipmentFor(view.id), 6000);
    if (s) {
      if (s.trackingNumber) view.tracking = s.trackingNumber;
      if (s.status) view.cdekStatus = s.status;
      if (s.keepFreeUntil) view.keepFreeUntil = s.keepFreeUntil;
      const code = s.statusCode ?? "";
      if (code === "DELIVERED") view.step = 5;
      else if (AT_PICKUP_CODES.includes(code) || s.arrivedAt) view.step = 4;
      // «Создан» — накладная есть, но посылку ещё не сдали в СДЭК
      else if (code && code !== "CREATED" && code !== "ACCEPTED" && view.step < 3) view.step = 3;
    }
  } catch (err) {
    console.error("[track] СДЭК:", (err as Error).message);
  }
  return view;
}

/**
 * Поиск без второго подтверждения (только номер или только телефон): адрес пункта выдачи не показываем —
 * только «СДЭК, пункт выдачи». Сумма, состав, этап и трек-номер — видны.
 */
const publicView = (v: TrackView): TrackView => ({
  ...v,
  delivery: v.manual ? "" : v.delivery ? "СДЭК, пункт выдачи" : "",
});

/** null — заказа с таким номером (и контактом, если он указан) нет */
export async function trackOrder(id: string, contact = ""): Promise<TrackView | null> {
  const view = dbEnabled() ? await fromDb(id, contact) : await fromSheet(id, contact);
  if (!view) return null;
  const full = await withCdek(view);
  return contact ? full : publicView(full);
}

/** Заказы по номеру телефона — самые новые сверху (пустой список — заказов нет) */
export async function trackByPhone(key: string): Promise<TrackView[]> {
  const list = dbEnabled() ? await fromDbByPhone(key) : await fromSheetByPhone(key);
  return (await Promise.all(list.map(withCdek))).map(publicView);
}
