/**
 * Платёж ЮKassa изменил статус — что делает сайт (из уведомления ЮKassa и из сверки):
 * статус заказа и платёж — в базу и таблицу; после успешной оплаты — письмо «Спасибо за заказ»,
 * потом накладная СДЭК (и письмо с трек-номером) — именно в таком порядке.
 */
import { revalidatePath } from "next/cache";
import { features } from "@/config/features";
import { shipPaidOrder, type ShipResult } from "@/lib/delivery/ship";
import { notifyPaid, quietly } from "@/lib/mail/notify";
import { updateOrder } from "@/lib/orders/store";
import type { OrderStatus } from "@/lib/orders/types";
import type { YooKassaPayment } from "./yookassa";

const STATUS_MAP: Partial<Record<string, OrderStatus>> = {
  succeeded: "paid",
  canceled: "payment_canceled",
  pending: "awaiting_payment",
  waiting_for_capture: "awaiting_payment",
};

export async function applyYooKassaPayment(payment: YooKassaPayment): Promise<{ followUp: () => Promise<{ ship?: ShipResult }> }> {
  const orderId = payment.metadata?.orderId ?? "";
  await updateOrder(orderId, {
    status: STATUS_MAP[payment.status],
    payment: {
      provider: "yookassa",
      paymentId: payment.id,
      status: payment.status as "pending" | "waiting_for_capture" | "succeeded" | "canceled",
      paidAt: payment.status === "succeeded" ? (payment.captured_at ?? new Date().toISOString()) : undefined,
      test: payment.test || undefined,
    },
    // Тестовая оплата: настоящую накладную в СДЭК не создаём
    ...(payment.test && payment.status === "succeeded" && payment.metadata?.pvz
      ? {
          delivery: {
            provider: "cdek" as const,
            label: `${payment.metadata.delivery || `СДЭК ПВЗ ${payment.metadata.pvz}`} · тестовая оплата, накладная не создавалась`,
          },
        }
      : {}),
  });

  const paid = payment.status === "succeeded" && !payment.test;
  if (paid) {
    // Оплата прошла — сразу обновляем счётчик остатка на страницах
    try {
      revalidatePath("/");
      revalidatePath("/en");
    } catch (err) {
      console.warn("[yookassa] Не удалось обновить страницы:", (err as Error).message);
    }
  }

  const followUp = async (): Promise<{ ship?: ShipResult }> => {
    if (!paid) return {};
    const m = payment.metadata ?? {};
    await quietly(
      notifyPaid({
        id: orderId,
        email: m.email ?? "",
        name: m.name ?? "",
        quantity: Number(m.qty) || 1,
        total: Number(payment.amount.value) || 0,
        delivery: m.delivery || (m.pvz ? `СДЭК ПВЗ ${m.pvz}` : ""),
        ...(m.kit ? { kit: m.kit } : {}),
      }),
    );
    if (features.cdek && features.cdekAutoShipment && m.pvz) return { ship: await shipPaidOrder(payment) };
    return {};
  };
  return { followUp };
}
