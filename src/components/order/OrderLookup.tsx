"use client";

import { useState, type FormEvent } from "react";
import type { Lang } from "@/i18n/lang";
import { formatPrice } from "@/lib/format";
import type { TrackView } from "@/lib/orders/track";
import styles from "./OrderLookup.module.css";

const TX = {
  ru: {
    lead: "Введите номер заказа из письма или со страницы оплаты и почту либо телефон, указанные при оформлении.",
    id: "Номер заказа",
    contact: "Почта или телефон из заказа",
    contactPlaceholder: "you@example.com или +7 900 000-00-00",
    find: "Показать статус",
    finding: "Ищем заказ…",
    errors: {
      input: "Проверьте номер заказа — он выглядит так: KA-260925-AB12.",
      notfound: "Заказ не найден. Проверьте номер и почту (телефон) — они должны совпадать с указанными при оформлении.",
      rate: "Слишком много попыток. Подождите несколько минут и попробуйте снова.",
      unavailable: "Не удалось получить статус. Попробуйте чуть позже.",
    } as Record<string, string>,
    steps: ["Оформлен", "Оплачен", "Собран", "Передан в СДЭК", "В пункте выдачи", "Получен"],
    hints: [
      "Заказ оформлен и ждёт оплаты. Если вы уже оплатили, статус обновится в течение нескольких минут.",
      "Оплата получена. Собираем заказ и передадим его в СДЭК.",
      "Заказ собран и ждёт передачи в СДЭК.",
      "Посылка в пути. Когда она придёт в пункт выдачи, СДЭК пришлёт уведомление.",
      "Посылка ждёт вас в пункте выдачи. Возьмите с собой паспорт.",
      "Заказ получен. Спасибо за покупку!",
    ],
    canceled: "Заказ отменён или оплата не прошла. Деньги не списаны; оформить заказ можно заново.",
    manual: "Доставка этого заказа согласуется индивидуально — мы свяжемся с вами по почте.",
    order: "Заказ",
    from: "от",
    goods: (q: number, kit: boolean) => `${kit ? "Подарочный набор" : "Мел Kamui × Iosif Abramov 0.98 β"} · ${q} шт.`,
    total: "Сумма",
    delivery: "Доставка",
    tracking: "Трек-номер СДЭК",
    track: "Отследить на сайте СДЭК",
    cdek: "Статус в СДЭК",
    keep: "Бесплатное хранение до",
    another: "Проверить другой заказ",
    help: "Нужна помощь с заказом?",
    tg: "Напишите в Telegram",
    mail: "или на почту",
    locale: "ru-RU",
  },
  en: {
    lead: "Enter the order number from the email or the payment page, and the email or phone you used when ordering.",
    id: "Order number",
    contact: "Email or phone from the order",
    contactPlaceholder: "you@example.com or +49 30 1234567",
    find: "Show status",
    finding: "Looking up…",
    errors: {
      input: "Please check the order number — it looks like KA-260925-AB12.",
      notfound: "Order not found. Check the number and the email (phone) — they must match the ones used when ordering.",
      rate: "Too many attempts. Please wait a few minutes and try again.",
      unavailable: "Could not get the status. Please try again later.",
    } as Record<string, string>,
    steps: ["Placed", "Paid", "Packed", "Handed to CDEK", "At pickup point", "Received"],
    hints: [
      "The order is placed and awaits payment. If you have already paid, the status will update within a few minutes.",
      "Payment received. We are packing your order and will hand it to CDEK.",
      "The order is packed and will be handed to CDEK shortly.",
      "The parcel is on its way. CDEK will notify you when it arrives at the pickup point.",
      "The parcel is waiting for you at the pickup point. Bring your ID.",
      "The order has been received. Thank you!",
    ],
    canceled: "The order was cancelled or the payment did not go through. You were not charged; you can place the order again.",
    manual: "Delivery of this order is arranged individually — we will contact you by email.",
    order: "Order",
    from: "placed",
    goods: (q: number, kit: boolean) => `${kit ? "Gift set" : "Kamui × Iosif Abramov 0.98 β chalk"} · ${q} pcs`,
    total: "Total",
    delivery: "Delivery",
    tracking: "CDEK tracking number",
    track: "Track on cdek.ru",
    cdek: "CDEK status",
    keep: "Free storage until",
    another: "Check another order",
    help: "Need help with your order?",
    tg: "Message us on Telegram",
    mail: "or email",
    locale: "en-GB",
  },
};

export function OrderLookup({
  initialId = "",
  lang = "ru",
  telegram,
  email,
}: {
  initialId?: string;
  lang?: Lang;
  telegram?: { name: string; url: string };
  email?: string;
}) {
  const tx = TX[lang];
  const [id, setId] = useState(initialId);
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [order, setOrder] = useState<TrackView | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/orders/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: id.trim(), contact: contact.trim() }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; order?: TrackView; error?: string };
      if (res.ok && body.ok && body.order) setOrder(body.order);
      else setError(tx.errors[body.error ?? ""] ?? tx.errors.unavailable);
    } catch {
      setError(tx.errors.unavailable);
    } finally {
      setBusy(false);
    }
  };

  const date = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(tx.locale, { day: "numeric", month: "long", year: "numeric" });
  };

  const help = (telegram || email) && (
    <p className={styles.help}>
      {tx.help}{" "}
      {telegram && (
        <a href={telegram.url} target="_blank" rel="noopener noreferrer">
          {tx.tg} @{telegram.name}
        </a>
      )}
      {telegram && email && ` ${tx.mail} `}
      {email && <a href={`mailto:${email}`}>{email}</a>}
    </p>
  );

  if (order) {
    return (
      <div className={styles.result} lang={lang} role="status" aria-live="polite">
        <p className={styles.number}>
          {tx.order} <b>{order.id}</b> <span>{tx.from} {date(order.createdAt)}</span>
        </p>

        {order.canceled ? (
          <p className={styles.state} data-bad>
            {tx.canceled}
          </p>
        ) : order.manual ? (
          <p className={styles.state}>{order.step >= 1 ? `${tx.steps[1]}. ` : ""}{tx.manual}</p>
        ) : (
          <>
            <ol className={styles.steps}>
              {tx.steps.map((s, i) => (
                <li key={s} data-done={i <= order.step || undefined} data-current={i === order.step || undefined}>
                  <span aria-hidden="true">{i < order.step ? "✓" : i + 1}</span>
                  {s}
                </li>
              ))}
            </ol>
            <p className={styles.state}>{tx.hints[order.step]}</p>
          </>
        )}

        <dl className={styles.facts}>
          <div>
            <dt>{tx.order}</dt>
            <dd>{tx.goods(order.quantity, order.kit)}</dd>
          </div>
          <div>
            <dt>{tx.total}</dt>
            <dd>{formatPrice(order.total)}</dd>
          </div>
          {order.delivery && (
            <div>
              <dt>{tx.delivery}</dt>
              <dd>{order.delivery}</dd>
            </div>
          )}
          {order.tracking && order.step >= 1 && !order.canceled && (
            <div>
              <dt>{tx.tracking}</dt>
              <dd>
                <b>{order.tracking}</b>{" "}
                <a href={`https://www.cdek.ru/ru/tracking/?order_id=${encodeURIComponent(order.tracking)}`} target="_blank" rel="noopener noreferrer">
                  {tx.track}
                </a>
              </dd>
            </div>
          )}
          {order.cdekStatus && (
            <div>
              <dt>{tx.cdek}</dt>
              <dd>{order.cdekStatus}</dd>
            </div>
          )}
          {order.keepFreeUntil && order.step === 4 && (
            <div>
              <dt>{tx.keep}</dt>
              <dd>{date(order.keepFreeUntil)}</dd>
            </div>
          )}
        </dl>

        {help}
        <button type="button" className="btn btn--ghost" onClick={() => setOrder(null)}>
          {tx.another}
        </button>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={submit} lang={lang}>
      <p>{tx.lead}</p>
      <label className={styles.field}>
        <span>{tx.id}</span>
        <input
          name="order"
          required
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={20}
          placeholder="KA-260925-AB12"
          value={id}
          onChange={(e) => setId(e.target.value.toUpperCase())}
        />
      </label>
      <label className={styles.field}>
        <span>{tx.contact}</span>
        <input
          name="contact"
          required
          autoComplete="email"
          maxLength={120}
          placeholder={tx.contactPlaceholder}
          value={contact}
          onChange={(e) => setContact(e.target.value)}
        />
      </label>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn" disabled={busy}>
        {busy ? tx.finding : tx.find}
      </button>
      {help}
    </form>
  );
}
