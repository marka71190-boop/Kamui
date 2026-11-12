/**
 * «Проверить оплату Robokassa» на странице /cdek-orders: по номеру счёта (InvId из личного кабинета Robokassa)
 * или номеру заказа KA-… сайт спрашивает у Robokassa статус. Если оплачен, а сайт об этом не знал, —
 * отмечает заказ оплаченным, пишет покупателю и создаёт накладную. Если заказа нет ни в базе, ни в таблице,
 * восстанавливает его целиком из данных счёта (в счёте Robokassa есть всё для накладной).
 */
import { sql } from "@/lib/db/pg";
import { dbEnabled, ensureSchema } from "@/lib/db/schema";
import { ORDER_ID_RE } from "@/lib/orders/id";
import { mailMarksFor, orderIdByInvoice, shipMetaFor } from "@/lib/orders/repo";
import { saveOrder } from "@/lib/orders/store";
import type { Order } from "@/lib/orders/types";
import { getRobokassaState, robokassaConfig } from "./robokassa";
import { markRobokassaPaid } from "./robokassa-paid";
import type { PaymentShipmentMeta } from "./yookassa";

const STATE_TEXT: Record<number, string> = {
  5: "счёт создан, покупатель не оплатил",
  10: "оплата отменена",
  50: "деньги получены, Robokassa зачисляет их магазину",
  60: "деньги возвращены покупателю",
  80: "платёж приостановлен Robokassa",
  100: "оплачен",
};

/** Заказ из данных счёта Robokassa (если его нет ни в базе, ни в таблице) */
function orderFromInvoice(meta: PaymentShipmentMeta, outSum: number, invoice: string): Order {
  const qty = Number(meta.qty) || 1;
  return {
    id: meta.orderId,
    createdAt: new Date().toISOString(),
    status: "awaiting_payment",
    region: "ru",
    customer: { name: meta.name, phone: meta.phone, email: meta.email, ...(meta.tin ? { taxId: meta.tin } : {}) },
    address: { country: "", city: (meta.delivery ?? "").split(" · ")[1] ?? "" },
    ...(meta.kit ? { product: "kit" as const, tip: meta.kit } : {}),
    quantity: qty,
    unitPrice: Number(meta.price) || Math.round(outSum / qty),
    itemsTotal: (Number(meta.price) || 0) * qty,
    deliveryCost: Math.max(0, outSum - (Number(meta.price) || 0) * qty),
    total: outSum,
    currency: "RUB",
    comment: `Восстановлен из счёта Robokassa ${invoice}`,
    delivery: {
      provider: "cdek",
      label: meta.delivery || `СДЭК ПВЗ ${meta.pvz}`,
      ...(meta.pvz
        ? { cdek: { pickupPointCode: meta.pvz, ...(meta.tariff ? { tariffCode: Number(meta.tariff) } : {}), ...(meta.cc ? { countryCode: meta.cc } : {}), ...(meta.city ? { cityCode: Number(meta.city) } : {}) } }
        : {}),
    },
    payment: { provider: "robokassa", paymentId: `rk-${invoice}`, status: "pending", label: `ожидает оплаты · Robokassa · счёт ${invoice}` },
  };
}

export async function checkRobokassaInvoice(input: string): Promise<{ ok: boolean; text: string }> {
  // можно ввести номер счёта, номер заказа или оба сразу: «35924489 KA-261022-HGQM»
  const text = input.trim().toUpperCase();
  const typedOrder = /KA-\d{6}-[A-Z0-9]{4}/.exec(text)?.[0] ?? "";
  const typedInvoice = /\b(\d{1,19})\b/.exec(text.replace(typedOrder, " "))?.[1] ?? "";
  const q = typedInvoice || typedOrder;
  if (!robokassaConfig()) return { ok: false, text: "Robokassa не настроена на сайте" };
  let invoice = typedInvoice;
  if (!invoice && ORDER_ID_RE.test(q)) {
    if (!dbEnabled()) return { ok: false, text: "Без базы данных проверка работает только по номеру счёта Robokassa" };
    await ensureSchema();
    invoice = (await sql<{ rk: string | null }>("select rk_invoice as rk from orders where id = $1", [q])).rows[0]?.rk ?? "";
    if (!invoice) return { ok: false, text: `У заказа ${q} в базе нет счёта Robokassa — введите номер счёта из личного кабинета Robokassa` };
  }
  if (!invoice) return { ok: false, text: "Введите номер счёта Robokassa (цифры) или номер заказа KA-…" };

  const st = await getRobokassaState(invoice);
  if (!st.found) {
    const why =
      st.resultCode === 3
        ? "Robokassa не нашла такой счёт"
        : st.resultCode === 1
          ? "Robokassa не приняла подпись — проверьте ROBOKASSA_PASSWORD2 и ROBOKASSA_HASH"
          : `ответ Robokassa: код ${st.resultCode}${st.error ? ` — ${st.error}` : ""}`;
    return { ok: false, text: `Счёт ${invoice}: ${why}` };
  }
  // номер заказа: из ответа Robokassa (если она его передаёт), из введённого текста, по номеру счёта в базе/таблице
  const orderId = st.orderId || st.meta?.orderId || typedOrder || (await orderIdByInvoice(invoice)) || "";
  const state = STATE_TEXT[st.code] ?? `код ${st.code}`;
  if (st.status !== "succeeded" && st.code !== 50) return { ok: false, text: `Счёт ${invoice}${orderId ? ` (заказ ${orderId})` : ""}: ${state}` };
  if (!orderId)
    return {
      ok: false,
      text: `Счёт ${invoice} оплачен, но сайт не нашёл, к какому заказу он относится. Введите номер счёта вместе с номером заказа из описания операции в Robokassa, например: ${invoice} KA-261022-XXXX`,
    };

  const outSum = st.outSum ?? 0;
  let restored = false;
  if (dbEnabled() && st.meta?.pvz) {
    await ensureSchema();
    const exists = (await sql("select 1 from orders where id = $1", [orderId])).rowCount > 0;
    if (!exists) {
      await saveOrder(orderFromInvoice({ ...st.meta, orderId }, outSum, invoice));
      restored = true;
    }
  }
  // Robokassa не передала данные заказа — берём их из базы. Письмо «Спасибо за заказ» — если ещё не уходило;
  // накладную по таким (восстановленным из таблицы) данным создаём только кнопкой — пусть продавец проверит
  let meta = st.meta ?? null;
  let derived = false;
  if (!meta) {
    const fromDb = await shipMetaFor(orderId).catch(() => null);
    if (fromDb) {
      const { pvz: _pvz, ...rest } = fromDb;
      meta = rest;
      derived = true;
    }
  }
  const marks = await mailMarksFor(orderId).catch(() => null);
  if (meta && marks && /оплата/.test(marks)) meta = { ...meta, email: "" };
  const { saved, followUp } = await markRobokassaPaid({ orderId, invoiceId: invoice, outSum: String(outSum), meta, test: false });
  const { ship } = await followUp();
  const shipText = ship
    ? ship.ok
      ? ship.existed
        ? `накладная уже была${ship.trackingNumber ? ` — № ${ship.trackingNumber}` : ""}`
        : `накладная создана${ship.trackingNumber ? ` — № ${ship.trackingNumber}` : ""}`
      : `накладная не создана: ${ship.error}`
    : derived
      ? "накладную создайте кнопкой «Создать накладную» у заказа (данные пункта выдачи взяты из таблицы — проверьте их)"
      : "данных для накладной нет — оформите отправку вручную";
  return {
    ok: saved && (!ship || ship.ok),
    text:
      `Счёт ${invoice}: ${state}, ${outSum ? `${Math.round(outSum).toLocaleString("ru-RU")} ₽, ` : ""}заказ ${orderId}` +
      `${restored ? " (заказа не было на сайте — восстановлен из счёта)" : ""}. Отмечен оплаченным, ${shipText}.` +
      (saved ? "" : " Отметку об оплате записать не удалось — попробуйте ещё раз."),
  };
}
