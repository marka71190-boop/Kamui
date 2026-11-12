/**
 * Как уходит письмо покупателю.
 *
 *  1. Напрямую с почтового сервера Timeweb (SMTP_USER / SMTP_PASSWORD; порт 465, если закрыт — 587).
 *  2. Если хостинг не пускает к почтовому серверу (порты закрыты) — через скрипт таблицы:
 *     он отправляет письмо из Gmail владельца таблицы от имени shop@abramov.shop
 *     (адрес добавлен в Gmail → Настройки → Аккаунты → «Отправлять письма как»).
 *     Покупатель видит то же самое: отправитель shop@abramov.shop, ответ — на shop@abramov.shop.
 *
 *  MAIL_TRANSPORT=auto   — по умолчанию: сначала сервер Timeweb, при недоступности — Gmail
 *  MAIL_TRANSPORT=sheets — только через Gmail (тогда SMTP_PASSWORD не нужен)
 *  MAIL_TRANSPORT=smtp   — только через сервер Timeweb
 */
import { SELLER } from "@/config/site";
import { sendMailViaSheet, sheetsConfigured } from "@/lib/orders/stores/google-sheets";
import { sendSmtpAny, smtpConfig, SmtpConnectError, type MailMessage } from "./smtp";

export type MailRoute = "smtp" | "gmail";

const HOUR = 3600 * 1000;

function mode(): "auto" | "smtp" | "sheets" {
  const v = (process.env.MAIL_TRANSPORT || "").trim().toLowerCase();
  return v === "smtp" || v === "sheets" ? v : "auto";
}

/** Пути отправки по порядку; пусто — письма выключены */
export function mailRoutes(): MailRoute[] {
  if (process.env.MAIL_ENABLED === "false") return [];
  const m = mode();
  const routes: MailRoute[] = [];
  if (m !== "sheets" && smtpConfig()) routes.push("smtp");
  if (sheetsConfigured() && (m === "sheets" || (m === "auto" && routes.length))) routes.push("gmail");
  return routes;
}

/** Адрес отправителя */
export const mailFrom = () => process.env.MAIL_FROM?.trim() || smtpConfig()?.user || process.env.SMTP_USER?.trim() || SELLER.email || "";

/** Сервер Timeweb недоступен — час не пробуем, сразу через Gmail (потом проверяем снова) */
let smtpDownUntil = 0;
let smtpDownReason = "";
let lastRoute: MailRoute | null = null;

export function mailStatus(): { routes: MailRoute[]; smtpDown: string; lastRoute: MailRoute | null } {
  return { routes: mailRoutes(), smtpDown: Date.now() < smtpDownUntil ? smtpDownReason : "", lastRoute };
}

/** Отправляет письмо первым работающим путём. Возвращает, каким путём ушло. */
export async function sendMail(m: MailMessage): Promise<MailRoute> {
  const routes = mailRoutes();
  if (!routes.length) throw new Error("письма не настроены");
  const errors: string[] = [];
  for (const route of routes) {
    if (route === "smtp") {
      if (routes.length > 1 && Date.now() < smtpDownUntil) continue;
      try {
        await sendSmtpAny(smtpConfig()!, m);
        smtpDownUntil = 0;
        lastRoute = "smtp";
        return "smtp";
      } catch (err) {
        const msg = (err as Error).message;
        if (err instanceof SmtpConnectError) {
          smtpDownUntil = Date.now() + HOUR;
          smtpDownReason = msg;
        }
        errors.push(msg);
      }
    } else {
      try {
        await sendMailViaSheet({
          to: m.to,
          subject: m.subject,
          text: m.text,
          html: m.html,
          from: m.from.address,
          fromName: m.from.name,
          ...(m.replyTo ? { replyTo: m.replyTo } : {}),
        });
        lastRoute = "gmail";
        return "gmail";
      } catch (err) {
        errors.push((err as Error).message);
      }
    }
  }
  if (!errors.length && smtpDownReason) errors.push(smtpDownReason);
  throw new Error(errors.join(" · "));
}
