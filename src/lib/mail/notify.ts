/**
 * Письма покупателю с сайта: отправка, защита от повторов и отметка в таблице заказов
 * (колонка «Письма покупателю»: «оплата 23.10.2026 14:30», «трек 1234567890 23.10.2026 18:02», «хранение …»).
 */
import { SELLER } from "@/config/site";
import { updateOrder } from "@/lib/orders/store";
import { logOrderEvent } from "@/lib/orders/stores/postgres";
import { dbEnabled } from "@/lib/db/schema";
import { mailFrom, mailRoutes, sendMail } from "./transport";
import { intlAckMail, intlPayMail, paidMail, storageMail, trackMail, usageMail, type Mail, type MailOrder } from "./templates";

export type { MailOrder } from "./templates";

/** Письма включены: есть ящик и пароль (SMTP_USER / SMTP_PASSWORD) или MAIL_TRANSPORT=sheets (через Gmail) */
export const mailEnabled = () => mailRoutes().length > 0 && Boolean(mailFrom());

export const validEmail = (s: string) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/.test(String(s || "").trim());

/** Что уже отправлено, пока сервер работает (после перезапуска — по отметкам в таблице) */
const sent = new Set<string>();

const nowMsk = () =>
  new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", "");

const ddmm = (d: Date) => d.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit" });

/** Отправляет письмо (один раз на key) и дописывает отметку в таблицу. true — письмо ушло. */
async function deliver(o: MailOrder, mail: Mail, key: string, note: string): Promise<boolean> {
  if (!mailEnabled() || !validEmail(o.email) || sent.has(key)) return false;
  sent.add(key);
  try {
    await sendMail({
      from: { name: process.env.MAIL_FROM_NAME?.trim() || "Abramov Shop", address: mailFrom() },
      to: o.email.trim(),
      replyTo: SELLER.email || undefined,
      ...mail,
    });
  } catch (err) {
    sent.delete(key);
    console.error(`[mail] Письмо «${note}» по заказу ${o.id} не отправлено:`, (err as Error).message);
    // причина — в историю заказа, её видно на странице /cdek-orders
    if (dbEnabled()) await logOrderEvent(o.id, "mail_error", `Письмо «${note.replace(/\s.*$/, "")}» не отправлено на ${o.email}: ${(err as Error).message}`);
    throw err;
  }
  await updateOrder(o.id, { mailNote: `${note} ${nowMsk()}` });
  return true;
}

/** «Спасибо за заказ, оплата получена» */
export const notifyPaid = (o: MailOrder) => deliver(o, paidMail(o), `${o.id}:paid`, "оплата");

/** Трек-номер СДЭК со ссылкой для отслеживания */
export async function notifyTrack(o: MailOrder, track: string): Promise<boolean> {
  const sentNow = await deliver(o, trackMail(o, track), `${o.id}:track:${track}`, `трек ${track}`);
  // Следом — отдельное письмо «как пользоваться мелом» (один раз на заказ). Ошибка здесь не должна ломать отправку трека.
  if (sentNow) await deliver(o, usageMail(o), `${o.id}:usage`, "как пользоваться").catch(() => false);
  return sentNow;
}

/** Посылка в пункте выдачи — срок хранения заканчивается */
export const notifyStorage = (o: MailOrder, track: string, until: Date, manual = false) =>
  deliver(
    o,
    storageMail(o, track, until),
    // вручную со страницы накладных — можно отправить ещё раз (например, за день до конца хранения)
    manual ? `${o.id}:storage:${track}:${Date.now()}` : `${o.id}:storage:${track}`,
    `хранение ${track} до ${ddmm(until)}${manual ? " (вручную)" : ""}`,
  );

/** Международный заказ: «заявка принята, менеджер проверит данные» — сразу после заявки */
export const notifyIntlAck = (o: MailOrder) => deliver(o, intlAckMail(o), `${o.id}:intl-ack`, "заявка принята");

/** Международный заказ: сумма в долларах (с доставкой) и реквизиты — по кнопке менеджера, можно отправить ещё раз */
export const notifyIntlPay = (o: MailOrder, amountUsd: number, details: string) =>
  deliver(o, intlPayMail(o, amountUsd, details), `${o.id}:intl-pay:${amountUsd}:${Date.now()}`, `оплата $${amountUsd.toFixed(2)} (реквизиты)`);

/** Реквизиты для международных переводов — только в настройках сервера (INTL_PAYMENT_DETAILS), не в коде и не на сайте */
export const intlPaymentDetails = () => (process.env.INTL_PAYMENT_DETAILS ?? "").replace(/\\n/g, "\n").trim();

/** Письмо без исключений наружу — для after(): ошибка уже записана в журнал сервера */
export async function quietly(p: Promise<boolean>): Promise<void> {
  try {
    await p;
  } catch {
    /* см. журнал сервера */
  }
}
