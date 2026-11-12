/**
 * Статус заказа для покупателя (страница /order): по номеру заказа и почте или телефону из заказа.
 * Отдаём только то, что нужно для отслеживания, — без ФИО и контактов.
 */
import { features } from "@/config/features";
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

async function fromDb(id: string, contact: string): Promise<TrackView | null> {
  await ensureSchema();
  const r = (
    await sql<Row>(
      `select o.id, o.created_at, o.status, o.email, o.phone, o.total, o.data, o.tracking, f.manual_tracking, f.packed_at
         from orders o left join order_flags f on f.order_id = o.id where o.id = $1`,
      [id],
    )
  ).rows[0];
  if (!r || !contactMatches(contact, r.email, r.phone)) return null;
  const d = r.data;
  const tracking = r.tracking || d.delivery?.cdek?.trackingNumber || r.manual_tracking || undefined;
  return {
    id: r.id,
    createdAt: r.created_at,
    step: stepOf(r.status, Boolean(r.packed_at)),
    canceled: r.status === "cancelled" || r.status === "payment_canceled",
    manual: d.delivery?.provider !== "cdek",
    quantity: Number(d.quantity) || 1,
    kit: d.product === "kit",
    total: Math.round(Number(r.total) || 0),
    delivery: cleanLabel(d.delivery?.label ?? ""),
    ...(tracking ? { tracking } : {}),
  };
}

/** Без базы — из Google Таблицы (заказы за последние 90 дней) */
async function fromSheet(id: string, contact: string): Promise<TrackView | null> {
  const ov = await ordersOverview(90, true);
  const o = [...(ov?.paid ?? []), ...(ov?.awaiting ?? []), ...(ov?.intl ?? [])].find((x) => x.id === id);
  if (!o || !contactMatches(contact, o.email, o.phone)) return null;
  const tracking = / · трек (\d{6,14})/.exec(o.delivery)?.[1];
  return {
    id: o.id,
    createdAt: o.createdAt,
    step: stepOf(o.status, false),
    canceled: /отмен/i.test(o.status),
    manual: !/^СДЭК/.test(o.delivery),
    quantity: o.quantity || 1,
    kit: /^Подарочный набор/.test(o.comment),
    total: Math.round(o.total || 0),
    delivery: cleanLabel(o.delivery),
    ...(tracking ? { tracking } : {}),
  };
}

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([p, new Promise<null>((res) => setTimeout(() => res(null), ms))]);

/** null — заказа с таким номером и контактом нет */
export async function trackOrder(id: string, contact: string): Promise<TrackView | null> {
  const view = dbEnabled() ? await fromDb(id, contact) : await fromSheet(id, contact);
  if (!view || view.canceled || view.manual || view.step === 0 || view.step === 5 || !features.cdek) return view;
  // Оплаченный заказ: уточняем у СДЭК, где посылка (не дольше нескольких секунд — иначе покажем то, что знаем сами)
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
