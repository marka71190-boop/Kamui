"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatPrice } from "@/lib/format";
import { ArrowRight, Check } from "@/components/ui/Icons";
import { OrderNumber, orderStatusHref, SupportLink } from "./OrderExtras";
import styles from "./Purchase.module.css";

type Status = "checking" | "succeeded" | "pending" | "canceled" | "unknown" | "error";

const STORAGE_KEY = "kamui:payment";

/** Запоминаем платёж перед уходом на страницу оплаты (ЮKassa или Robokassa «rk-<счёт>») — так статус найдётся быстрее. */
export function rememberPayment(orderId: string, paymentId: string) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ orderId, paymentId }));
  } catch {
    /* приватный режим — не страшно, найдём по номеру заказа */
  }
}

function recalledPayment(orderId: string): string {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null") as { orderId?: string; paymentId?: string } | null;
    return saved?.orderId === orderId && saved.paymentId ? saved.paymentId : "";
  } catch {
    return "";
  }
}

const MAX_TRIES = 8;

export function PaymentResult({
  orderId,
  onReset,
  onPaid,
}: {
  orderId: string;
  onReset: () => void;
  /** Оплата подтверждена — черновик формы больше не нужен */
  onPaid?: () => void;
}) {
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;
  const [status, setStatus] = useState<Status>("checking");
  const [amount, setAmount] = useState<number | null>(null);
  const [payUrl, setPayUrl] = useState("");
  const tries = useRef(0);
  const timer = useRef<number | undefined>(undefined);

  const check = useCallback(async () => {
    window.clearTimeout(timer.current);
    tries.current += 1;
    try {
      const q = new URLSearchParams({ order: orderId });
      const pid = recalledPayment(orderId);
      if (pid) q.set("payment", pid);
      const res = await fetch(`/api/payments/status?${q}`, { cache: "no-store" });
      const data = (await res.json()) as { ok?: boolean; status?: string; amount?: number; paymentUrl?: string };
      if (!res.ok || !data.ok) throw new Error();
      if (typeof data.amount === "number") setAmount(data.amount);
      setPayUrl(data.paymentUrl ?? "");
      const s = data.status;
      if (s === "succeeded" || s === "canceled") {
        if (s === "succeeded") onPaidRef.current?.();
        setStatus(s);
        return;
      }
      // Банк мог ещё не подтвердить платёж — спрашиваем повторно несколько раз
      if (tries.current < MAX_TRIES) {
        timer.current = window.setTimeout(check, 2500);
      } else {
        setStatus(s === "pending" || s === "waiting_for_capture" ? "pending" : "unknown");
      }
    } catch {
      if (tries.current < 3) timer.current = window.setTimeout(check, 2500);
      else setStatus("error");
    }
  }, [orderId]);

  useEffect(() => {
    void check();
    return () => window.clearTimeout(timer.current);
  }, [check]);

  const retry = () => {
    tries.current = MAX_TRIES - 2;
    setStatus("checking");
    void check();
  };

  const order = <OrderNumber id={orderId} label="Номер заказа" />;

  const mailHint = (
    <>
      <p className={styles.successText}>
        Проверьте почту — и папку «Спам»: туда придут письма по заказу. Статус и трек-номер всегда можно посмотреть на
        странице{" "}
        <a href={orderStatusHref(orderId)} className={styles.link}>
          «Где мой заказ»
        </a>
        .
      </p>
      <SupportLink />
    </>
  );

  if (status === "checking") {
    return (
      <div className={styles.success} role="status" aria-live="polite">
        <span className={styles.pending} aria-hidden="true" />
        <p className={styles.successTitle}>Проверяем оплату</p>
        <p className={styles.successText}>Это займёт несколько секунд — не закрывайте страницу.</p>
        {order}
      </div>
    );
  }

  if (status === "succeeded") {
    return (
      <div className={styles.success} role="status" aria-live="polite">
        <span className={styles.successIcon} aria-hidden="true">
          <Check />
        </span>
        <p className={styles.successTitle}>Оплата прошла</p>
        <p className={styles.successText}>
          Спасибо! Заказ оплачен{amount ? ` — ${formatPrice(amount)}` : ""}. Мы передадим его в СДЭК, а когда посылка
          прибудет в пункт выдачи, СДЭК пришлёт уведомление. Чек об оплате придёт на вашу почту.
        </p>
        {order}
        {mailHint}
        <button type="button" className="btn btn--ghost" onClick={onReset}>
          Вернуться к покупке
        </button>
      </div>
    );
  }

  if (status === "pending") {
    return (
      <div className={styles.success} role="status" aria-live="polite">
        <span className={styles.pending} data-still aria-hidden="true" />
        <p className={styles.successTitle}>Ожидаем оплату</p>
        <p className={styles.successText}>
          Платёж ещё не завершён. Если вы уже оплатили, статус обновится в течение нескольких минут.
        </p>
        {order}
        {mailHint}
        <div className={styles.actions}>
          {payUrl && (
            <a href={payUrl} className="btn">
              Перейти к оплате
              <ArrowRight className="btn__arrow" />
            </a>
          )}
          <button type="button" className="btn btn--ghost" onClick={retry}>
            Проверить ещё раз
          </button>
        </div>
      </div>
    );
  }

  if (status === "canceled") {
    return (
      <div className={styles.success} role="status" aria-live="polite">
        <span className={styles.failIcon} aria-hidden="true">
          ×
        </span>
        <p className={styles.successTitle}>Оплата не прошла</p>
        <p className={styles.successText}>
          Платёж отменён или не был завершён, деньги не списаны. Можно оформить заказ ещё раз или выбрать другой способ
          оплаты.
        </p>
        {order}
        <SupportLink text="Не получается оплатить?" />
        <button type="button" className="btn" onClick={onReset}>
          Оформить заново
          <ArrowRight className="btn__arrow" />
        </button>
      </div>
    );
  }

  return (
    <div className={styles.success} role="status" aria-live="polite">
      <span className={styles.pending} data-still aria-hidden="true" />
      <p className={styles.successTitle}>Заказ принят</p>
      <p className={styles.successText}>
        Не удалось сразу проверить оплату. Если вы оплатили заказ, мы получим подтверждение от платёжного сервиса и свяжемся с вами.
      </p>
      {order}
      {mailHint}
      <div className={styles.actions}>
        <button type="button" className="btn btn--ghost" onClick={retry}>
          Проверить ещё раз
        </button>
        <button type="button" className="btn btn--ghost" onClick={onReset}>
          Новый заказ
        </button>
      </div>
    </div>
  );
}
