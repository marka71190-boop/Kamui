/**
 * Проверка раз в 30 минут (и по кнопке на странице /cdek-orders): какие письма покупателям пора отправить.
 *
 *  • «Спасибо за заказ» — если после оплаты письмо почему-то не ушло сразу (только заказы не старше 3 дней
 *    и оформленные после включения писем — MAIL_SINCE);
 *  • трек-номер — как только у заказа появился номер СДЭК (если письмо с этим номером ещё не уходило
 *    и посылка ещё не вручена);
 *  • напоминание о сроке хранения — за 2 дня до конца бесплатного хранения в пункте выдачи.
 *
 * Список заказов и отметки об отправленных письмах — из таблицы заказов (лист «Заказы»), статусы — из СДЭК.
 */
import { features } from "@/config/features";
import { AT_PICKUP_CODES } from "@/lib/delivery/cdek";
import { shipmentFor } from "@/lib/orders/flags";
import { importedAt, importOldOrders } from "@/lib/db/import";
import { dbEnabled } from "@/lib/db/schema";
import { shipMissing } from "@/lib/delivery/auto-ship";
import { ordersOverview } from "@/lib/orders/repo";
import type { SheetPaidOrder } from "@/lib/orders/stores/google-sheets";
import { reconcileRobokassa } from "@/lib/payments/robokassa-reconcile";
import { reconcileYooKassa } from "@/lib/payments/yookassa-reconcile";
import { mailEnabled, notifyPaid, notifyStorage, notifyTrack, validEmail, type MailOrder } from "./notify";

const DAY = 24 * 3600 * 1000;

function envNum(v: string | undefined, def: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : def;
}

/** Сколько дней посылка бесплатно хранится в пункте выдачи (если СДЭК сам не сообщает дату) */
export const storageDays = () => envNum(process.env.CDEK_STORAGE_DAYS, 7);
/** За сколько дней до конца хранения напоминать */
export const remindDaysBefore = () => envNum(process.env.STORAGE_REMIND_DAYS, 2);
/** С какого момента писать «Спасибо за заказ» (чтобы старые заказы не получили его задним числом) */
const mailSince = () => Date.parse(process.env.MAIL_SINCE || "2026-10-23T00:00:00+03:00") || 0;

/** Посылка вручена или вернулась — писать больше нечего */
const FINAL_CODES = ["DELIVERED", "NOT_DELIVERED", "INVALID", "RETURNED", "RETURNED_TO_SENDER_CITY_WAREHOUSE"];

/** Конец бесплатного хранения: дата от СДЭК или день прибытия + CDEK_STORAGE_DAYS (до конца дня по Москве) */
export function storageUntil(arrivedAt?: string, keepFreeUntil?: string): Date | null {
  if (keepFreeUntil) {
    const d = new Date(/T/.test(keepFreeUntil) ? keepFreeUntil : `${keepFreeUntil}T23:59:00+03:00`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (!arrivedAt) return null;
  const a = new Date(arrivedAt.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  if (Number.isNaN(a.getTime())) return null;
  // день прибытия по Москве + N дней, конец дня
  const msk = new Date(a.getTime() + 3 * 3600 * 1000);
  const end = Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth(), msk.getUTCDate() + storageDays(), 23, 59) - 3 * 3600 * 1000;
  return new Date(end);
}

export function mailOrderFrom(o: SheetPaidOrder): MailOrder {
  const kit = /^Подарочный набор/.test(o.comment) ? /наклейка JOS\s+(\S+)/.exec(o.comment)?.[1] : undefined;
  return {
    id: o.id,
    email: o.email,
    name: o.name,
    quantity: o.quantity,
    total: o.total,
    delivery: o.delivery.replace(/ · трек \d+.*$/, ""),
    ...(kit ? { kit } : {}),
  };
}

export interface MailReport {
  checked: number;
  paid: number;
  track: number;
  storage: number;
  errors: string[];
  skipped?: string;
}

async function check(o: SheetPaidOrder, r: MailReport, now: number): Promise<void> {
  const marks = o.mailMarks ?? "";
  // Перенесён в базу без отметок о письмах — не знаем, что уже уходило, поэтому сами не пишем (кнопки на странице работают)
  if (/^импорт без отметок/m.test(marks)) return;
  const mo = mailOrderFrom(o);
  const created = Date.parse(o.createdAt) || 0;

  if (!/оплата/i.test(marks) && created >= mailSince() && now - created < 3 * DAY) {
    if (await notifyPaid(mo)) r.paid++;
  }

  if (!/^СДЭК ПВЗ/.test(o.delivery) || !features.cdek) return;
  const s = await shipmentFor(o.id);
  if (!s?.trackingNumber || FINAL_CODES.includes(String(s.statusCode))) return;
  const track = s.trackingNumber;

  if (!new RegExp(`трек\\s*${track}`).test(marks)) {
    if (await notifyTrack(mo, track)) r.track++;
  }

  if (AT_PICKUP_CODES.includes(String(s.statusCode)) && !new RegExp(`хранение\\s*${track}`).test(marks)) {
    const until = storageUntil(s.arrivedAt, s.keepFreeUntil);
    if (until && now >= until.getTime() - remindDaysBefore() * DAY && now < until.getTime()) {
      if (await notifyStorage(mo, track, until)) r.storage++;
    }
  }
}

let running: Promise<MailReport> | null = null;

/** Одна проверка (если уже идёт — ждём её же) */
export function runMailJobs(): Promise<MailReport> {
  running ??= (async () => {
    const r: MailReport = { checked: 0, paid: 0, track: 0, storage: 0, errors: [] };
    if (!mailEnabled()) return { ...r, skipped: "письма не настроены: нет SMTP_USER / SMTP_PASSWORD (или MAIL_TRANSPORT=sheets и SMTP_USER)" };
    const orders = (await ordersOverview(30, false))?.paid ?? null;
    if (orders === null || orders.some((o) => o.mailMarks === undefined)) {
      return { ...r, skipped: "скрипт таблицы старой версии — обновите его, чтобы письма не уходили дважды" };
    }
    const now = Date.now();
    const list = orders.filter((o) => validEmail(o.email));
    for (let i = 0; i < list.length; i += 5) {
      await Promise.all(
        list.slice(i, i + 5).map((o) =>
          check(o, r, now).catch((err) => {
            r.errors.push(`${o.id}: ${String((err as Error).message).slice(0, 160)}`);
          }),
        ),
      );
    }
    r.checked = list.length;
    return r;
  })().finally(() => {
    running = null;
  });
  return running;
}

/**
 * Подстраховка заказов: сверка оплат Robokassa (если уведомление не дошло) и накладные СДЭК,
 * которые не создались сами после оплаты.
 */
export async function runOrderJobs(): Promise<void> {
  // База подключена впервые — переносим в неё старые заказы (один раз)
  if (dbEnabled()) {
    try {
      if (!(await importedAt())) await importOldOrders();
    } catch (err) {
      console.error("[db] База недоступна:", (err as Error).message);
    }
  }
  const ov = await ordersOverview(14).catch((err) => {
    console.error("[orders] Заказы не загрузились:", (err as Error).message);
    return null;
  });
  if (ov?.awaiting?.length) {
    const r = await reconcileRobokassa(ov.awaiting);
    if (r.keysError) console.error(`[robokassa] ${r.keysError}`);
    if (r.errors.length) console.error(`[robokassa] Сверка: ${r.errors.join("; ")}`);
  }
  const y = await reconcileYooKassa().catch((err) => ({ fixed: [], errors: [(err as Error).message] }));
  if (y.errors.length) console.error(`[yookassa] Сверка: ${y.errors.join("; ")}`);
  const s = await shipMissing(ov?.paid ?? null);
  if (s.created.length) console.log(`[cdek] Созданы пропущенные накладные: ${s.created.join(", ")}`);
  if (s.errors.length) console.error(`[cdek] Накладные не созданы: ${s.errors.join("; ")}`);
}

const TIMER = Symbol.for("kamui.mailJobs");

/** Запуск по расписанию: через минуту после старта сервера, потом каждые 30 минут (заказы, затем письма) */
export function startMailJobs(): void {
  const g = globalThis as unknown as Record<symbol, unknown>;
  if (g[TIMER] || process.env.MAIL_JOBS === "false") return;
  const tick = () =>
    runOrderJobs()
      .catch((err) => console.error("[orders] Проверка заказов не удалась:", (err as Error).message))
      .then(() => runMailJobs())
      .then((r) => {
        if (r.paid || r.track || r.storage || r.errors.length)
          console.log(`[mail] оплата ${r.paid}, трек ${r.track}, хранение ${r.storage}${r.errors.length ? `, ошибки: ${r.errors.join("; ")}` : ""}`);
      })
      .catch((err) => console.error("[mail] Проверка писем не удалась:", (err as Error).message));
  g[TIMER] = setInterval(tick, 30 * 60 * 1000);
  setTimeout(tick, 60 * 1000);
}
