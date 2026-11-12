/**
 * Оплата через Robokassa подтверждена — что делает сайт:
 *   заказ в таблице → «Оплачена» (+ номер счёта в колонке «Платёж»),
 *   письмо покупателю «Спасибо за заказ», накладная СДЭК.
 *
 * Вызывается из уведомления Result URL и из сверки (если уведомление до сайта не дошло —
 * сайт сам спрашивает у Robokassa статус счёта, см. robokassa-reconcile.ts).
 */
import { revalidatePath } from "next/cache";
import { features } from "@/config/features";
import { shipOrder, type ShipResult } from "@/lib/delivery/ship";
import { notifyPaid, quietly } from "@/lib/mail/notify";
import { updateOrderStrict } from "@/lib/orders/store";
import { robokassaPaymentLabel } from "./robokassa";
import type { PaymentShipmentMeta } from "./yookassa";

export interface RobokassaPaid {
  orderId: string;
  invoiceId: string;
  outSum: string;
  meta: PaymentShipmentMeta | null;
  test: boolean;
}

export interface RobokassaPaidResult {
  /** Отметка «Оплачена» записана в таблицу */
  saved: boolean;
  /** Письмо и накладная — можно выполнить после ответа (after) или сразу */
  followUp: () => Promise<{ ship?: ShipResult }>;
}

export async function markRobokassaPaid(cb: RobokassaPaid): Promise<RobokassaPaidResult> {
  let saved = true;
  try {
    await updateOrderStrict(cb.orderId, {
      status: "paid",
      payment: {
        provider: "robokassa",
        paymentId: `rk-${cb.invoiceId}`,
        status: "succeeded",
        paidAt: new Date().toISOString(),
        test: cb.test || undefined,
        label: robokassaPaymentLabel(cb),
      },
      ...(cb.test && cb.meta?.pvz
        ? {
            delivery: {
              provider: "cdek" as const,
              label: `${cb.meta.delivery || `СДЭК ПВЗ ${cb.meta.pvz}`} · тестовая оплата, накладная не создавалась`,
            },
          }
        : {}),
    });
  } catch (err) {
    // Таблица не ответила — накладную всё равно создаём
    console.error(`[robokassa] Не удалось отметить оплату ${cb.orderId}:`, err);
    saved = false;
  }

  const followUp = async (): Promise<{ ship?: ShipResult }> => {
    if (cb.test) return {};
    try {
      revalidatePath("/");
      revalidatePath("/en");
    } catch {
      /* страница обновится сама */
    }
    const meta = cb.meta;
    // Письмо покупателю «Спасибо за заказ» (повторно не уходит — отметка в таблице и в памяти)
    if (meta?.email) {
      await quietly(
        notifyPaid({
          id: cb.orderId,
          email: meta.email,
          name: meta.name,
          quantity: Number(meta.qty) || 1,
          total: Number(cb.outSum) || 0,
          delivery: meta.delivery || (meta.pvz ? `СДЭК ПВЗ ${meta.pvz}` : ""),
          ...(meta.kit ? { kit: meta.kit } : {}),
        }),
      );
    }
    if (features.cdek && features.cdekAutoShipment && meta?.pvz) {
      return { ship: await shipOrder({ ...meta, orderId: cb.orderId }) };
    }
    return {};
  };
  return { saved, followUp };
}
