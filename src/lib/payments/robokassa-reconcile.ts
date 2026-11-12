/**
 * Сверка оплат Robokassa: если уведомление Result URL до сайта не дошло (не указан или неверный Result URL
 * в личном кабинете Robokassa, сбой сети), заказ так и остался бы «Ожидает оплаты» — без накладной и письма.
 * Сайт сам спрашивает у Robokassa статус счёта (OpStateExt) у заказов «Ожидает оплаты» за последние дни
 * и, если счёт оплачен, делает то же, что при уведомлении: «Оплачена», письмо покупателю, накладная СДЭК.
 *
 * Запускается раз в 30 минут (вместе с письмами) и при открытии страницы /cdek-orders.
 */
import type { ShipResult } from "@/lib/delivery/ship";
import { robokassaInvoiceFrom, type SheetPaidOrder } from "@/lib/orders/stores/google-sheets";
import { shipMetaFor } from "@/lib/orders/repo";
import { getRobokassaState, robokassaConfig } from "./robokassa";
import { markRobokassaPaid } from "./robokassa-paid";

export interface AwaitingRobokassa {
  order: SheetPaidOrder;
  invoice: string;
  /** Что ответила Robokassa: «не оплачен», «отменён»… */
  state: string;
}

export interface ReconcileReport {
  /** Оплаты, которые нашла сверка (заказ отмечен оплаченным) */
  paid: { orderId: string; invoice: string; ship?: ShipResult }[];
  /** Всё ещё ждут оплаты */
  pending: AwaitingRobokassa[];
  errors: string[];
  /** Robokassa не приняла ключи — уведомления об оплате тоже не проходят проверку */
  keysError?: string;
}

/** Статус счёта не спрашиваем чаще раза в 5 минут */
const cache = new Map<string, { at: number; state: string }>();
const cacheMs = () => Number(process.env.ROBOKASSA_CHECK_INTERVAL_MS) || 5 * 60 * 1000;
let running: Promise<ReconcileReport> | null = null;

export function reconcileRobokassa(awaiting: SheetPaidOrder[]): Promise<ReconcileReport> {
  running ??= run(awaiting).finally(() => {
    running = null;
  });
  return running;
}

async function run(awaiting: SheetPaidOrder[]): Promise<ReconcileReport> {
  const r: ReconcileReport = { paid: [], pending: [], errors: [] };
  const cfg = robokassaConfig();
  for (const o of awaiting) {
    const invoice = robokassaInvoiceFrom(o.payment);
    if (!invoice) continue;
    // тестовые счета Robokassa этим способом не видны
    if (/ТЕСТ/i.test(o.payment ?? "") || !cfg || cfg.test) {
      r.pending.push({ order: o, invoice, state: "тестовый счёт" });
      continue;
    }
    const cached = cache.get(invoice);
    if (cached && Date.now() - cached.at < cacheMs()) {
      r.pending.push({ order: o, invoice, state: cached.state });
      continue;
    }
    try {
      const st = await getRobokassaState(invoice, cfg);
      if (st.found && (st.status === "succeeded" || st.code === 50) && (!st.orderId || st.orderId === o.id)) {
        // Robokassa не всегда передаёт данные заказа — тогда письмо по данным из базы, а накладную — кнопкой
        let meta = st.meta ?? null;
        if (!meta) {
          const d = await shipMetaFor(o.id).catch(() => null);
          if (d) {
            const { pvz: _pvz, ...rest } = d;
            meta = rest;
          }
        }
        const { followUp } = await markRobokassaPaid({
          orderId: o.id,
          invoiceId: invoice,
          outSum: String(st.outSum ?? o.total),
          meta,
          test: false,
        });
        const { ship } = await followUp();
        cache.delete(invoice);
        r.paid.push({ orderId: o.id, invoice, ...(ship ? { ship } : {}) });
        console.log(`[robokassa] Сверка: счёт ${invoice} оплачен — заказ ${o.id} отмечен оплаченным`);
        continue;
      }
      let state: string;
      if (st.found) state = st.status === "canceled" ? "отменён или возвращён" : "не оплачен";
      else if (st.resultCode === 3) state = "покупатель не перешёл к оплате";
      else if (st.resultCode === 1) {
        r.keysError = "Robokassa не приняла подпись: проверьте ROBOKASSA_PASSWORD2 и ROBOKASSA_HASH в настройках сайта";
        state = "не удалось проверить";
      } else state = `ответ Robokassa: код ${st.resultCode}${st.error ? ` — ${st.error}` : ""}`;
      cache.set(invoice, { at: Date.now(), state });
      r.pending.push({ order: o, invoice, state });
    } catch (err) {
      r.errors.push(`${o.id}: ${String((err as Error).message).slice(0, 160)}`);
      r.pending.push({ order: o, invoice, state: "не удалось проверить" });
    }
  }
  return r;
}
