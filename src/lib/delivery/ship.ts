/**
 * После успешной оплаты: создаём отправление СДЭК и дописываем трек-номер в таблицу.
 * Данные о получателе и ПВЗ берутся из metadata платежа ЮKassa.
 *
 * Вызывается из вебхука ЮKassa (после ответа) и со служебной страницы /cdek-orders
 * (кнопка «Создать накладную» — если автоматически не получилось).
 */
import { notifyTrack, quietly } from "@/lib/mail/notify";
import { updateOrder } from "@/lib/orders/store";
import type { PaymentShipmentMeta, YooKassaPayment } from "@/lib/payments/yookassa";
import { CdekOrderRejected, createShipment, findShipment, getTrackingNumber, waitForTrackingNumber } from "./cdek";

export type ShipResult =
  | { ok: true; uuid: string; trackingNumber: string | null; existed: boolean }
  | { ok: false; error: string };

type ShipOptions = { /** Прошлую накладную СДЭК отклонил — создать заново */ retryRejected?: boolean };

/** Оплата через ЮKassa: данные для накладной — в metadata платежа */
export function shipPaidOrder(payment: YooKassaPayment, opts: ShipOptions = {}): Promise<ShipResult> {
  return shipOrder((payment.metadata ?? {}) as Partial<PaymentShipmentMeta>, opts);
}

/** Накладные, которые создаются прямо сейчас: второй вызов по тому же заказу ждёт первый, а не создаёт дубль */
const inFlight = new Map<string, Promise<ShipResult>>();

/** Создаёт накладную СДЭК по данным заказа (из ЮKassa или из параметров Robokassa) и пишет результат в таблицу */
export function shipOrder(m: Partial<PaymentShipmentMeta>, opts: ShipOptions = {}): Promise<ShipResult> {
  const key = m.orderId ?? "";
  const running = key ? inFlight.get(key) : undefined;
  if (running) return running;
  const p = shipOrderNow(m, opts).finally(() => inFlight.delete(key));
  if (key) inFlight.set(key, p);
  return p;
}

async function shipOrderNow(m: Partial<PaymentShipmentMeta>, opts: ShipOptions): Promise<ShipResult> {
  const orderId = m.orderId;
  if (!orderId || !m.pvz) return { ok: false, error: "В платеже нет данных о пункте выдачи СДЭК" };
  const base = m.delivery || `СДЭК ПВЗ ${m.pvz}`;

  let result: ShipResult;
  try {
    let shipment = await findShipment(orderId);
    let existed = Boolean(shipment);
    if (shipment && !shipment.trackingNumber && opts.retryRejected) {
      const rejected = await getTrackingNumber(shipment.uuid).then(
        () => false,
        (err) => err instanceof CdekOrderRejected,
      );
      if (rejected) {
        shipment = null;
        existed = false;
      }
    }
    if (!shipment) {
      const uuid = await createShipment({
        orderId,
        quantity: Number(m.qty) || 1,
        unitPrice: Number(m.price) || 0,
        pickupPointCode: m.pvz,
        tariffCode: m.tariff ? Number(m.tariff) : undefined,
        recipient: { name: m.name ?? "", phone: m.phone ?? "", email: m.email, tin: m.tin },
        countryCode: m.cc || undefined,
        kitTip: m.kit || undefined,
      });
      shipment = { uuid, trackingNumber: null };
    }
    const tracking = shipment.trackingNumber ?? (await waitForTrackingNumber(shipment.uuid));
    result = { ok: true, uuid: shipment.uuid, trackingNumber: tracking, existed };
  } catch (err) {
    console.error(`[cdek] Не удалось создать отправление для ${orderId}:`, err);
    result = { ok: false, error: err instanceof Error ? err.message.replace(/\s+/g, " ").slice(0, 300) : "ошибка СДЭК" };
  }

  // Результат — в колонку «Доставка» таблицы (если таблица недоступна, накладная в СДЭК от этого не пропадает)
  try {
    await updateOrder(orderId, {
      delivery: result.ok
        ? {
            provider: "cdek",
            label: result.trackingNumber ? `${base} · трек ${result.trackingNumber}` : `${base} · отправление создано в СДЭК`,
            cdek: { pickupPointCode: m.pvz, orderUuid: result.uuid, trackingNumber: result.trackingNumber ?? undefined },
          }
        : {
            provider: "cdek",
            label: `${base} · ⚠ отправление не создано автоматически — оформите в личном кабинете СДЭК (${result.error})`,
            cdek: { pickupPointCode: m.pvz },
          },
    });
  } catch (err) {
    console.error(`[cdek] Не удалось записать накладную ${orderId} в таблицу:`, err);
  }

  // Номер есть — сразу письмо покупателю с трек-номером (если номер появится позже, письмо отправит проверка раз в 30 минут)
  if (result.ok && result.trackingNumber && m.email) {
    await quietly(
      notifyTrack(
        {
          id: orderId,
          email: m.email,
          name: m.name ?? "",
          quantity: Number(m.qty) || 1,
          total: 0,
          delivery: base,
          ...(m.kit ? { kit: m.kit } : {}),
        },
        result.trackingNumber,
      ),
    );
  }
  return result;
}
