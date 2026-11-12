"use client";

/**
 * Экран ожидания после нажатия «Перейти к оплате» / «Отправить заявку».
 * Показывает, что происходит: шаги с галочками, красное кольцо и полоску прогресса.
 * Шаги до ответа сервера идут по времени (сервер обычно отвечает за 2–5 секунд),
 * последний шаг «Открываем страницу ЮKassa» — когда платёж уже создан и браузер уходит на оплату.
 * Экран не исчезает, пока браузер открывает страницу оплаты.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { t } from "@/i18n/dict";
import type { Lang } from "@/i18n/lang";
import { Check, Lock } from "@/components/ui/Icons";
import styles from "./CheckoutProgress.module.css";

/** Когда переключать шаги, пока ждём ответ сервера (мс от нажатия) */
const STEP_AT = [0, 1100, 2400];
/** Через сколько показать «чуть дольше обычного» */
const SLOW_AFTER = 7000;
/** Через сколько после ухода на оплату показать запасную ссылку */
const FALLBACK_AFTER = 7000;

export function CheckoutProgress({
  mode,
  redirecting,
  orderId,
  payUrl,
  provider = "ЮKassa",
  lang,
}: {
  mode: "pay" | "request";
  /** Платёж создан, браузер открывает страницу ЮKassa */
  redirecting: boolean;
  orderId?: string;
  payUrl?: string;
  /** Платёжный сервис, на страницу которого уходит покупатель */
  provider?: "ЮKassa" | "Robokassa";
  lang: Lang;
}) {
  const tx = t(lang).order.progress;
  const named = (s: string) => (provider === "ЮKassa" ? s : s.replace(/ЮKassa|YooKassa/g, provider));
  const steps = (mode === "pay" ? tx.paySteps : tx.requestSteps).map(named);
  const [mounted, setMounted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [sinceRedirect, setSinceRedirect] = useState(0);
  const redirectAt = useRef<number | null>(null);
  const titleId = "checkout-progress-title";

  useEffect(() => {
    setMounted(true);
    const t0 = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      setElapsed(now - t0);
      if (redirectAt.current !== null) setSinceRedirect(now - redirectAt.current);
    }, 200);
    // Страница под экраном не прокручивается
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      window.clearInterval(id);
      html.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    if (redirecting && redirectAt.current === null) redirectAt.current = performance.now();
  }, [redirecting]);

  // Пока ждём сервер — идём по шагам по времени, но последний шаг оплаты только после ответа
  const cap = mode === "pay" ? steps.length - 2 : steps.length - 1;
  const timed = STEP_AT.filter((ms) => elapsed >= ms).length - 1;
  const active = redirecting ? steps.length - 1 : Math.min(timed, cap);
  const progress = redirecting ? 100 : Math.min(92, ((active + 0.6) / steps.length) * 100 + Math.min(elapsed / 400, 12));
  const slow = !redirecting && elapsed > SLOW_AFTER;
  const showFallback = redirecting && !!payUrl && sinceRedirect > FALLBACK_AFTER;

  if (!mounted) return null;

  return createPortal(
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy="true">
      <div className={styles.card}>
        <div className={styles.bar} aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>

        <div className={styles.loader} aria-hidden="true">
          <span className={styles.ring} />
          <span className={styles.ringGlow} />
          <span className={styles.cube} />
        </div>

        <h2 id={titleId} className={styles.title}>
          {mode === "pay" ? tx.payTitle : tx.requestTitle}
        </h2>

        <ol className={styles.steps}>
          {steps.map((label, i) => {
            const state = i < active ? "done" : i === active ? "active" : "todo";
            return (
              <li key={label} className={styles.step} data-state={state} aria-current={state === "active" ? "step" : undefined}>
                <span className={styles.mark} aria-hidden="true">
                  {state === "done" ? <Check /> : <span className={styles.dot} />}
                </span>
                <span>{label}</span>
              </li>
            );
          })}
        </ol>

        <p className={styles.note} role="status" aria-live="polite">
          {redirecting && orderId ? tx.created(orderId) : slow ? tx.slow : tx.usually}
        </p>

        {showFallback && (
          <p className={styles.fallback}>
            {tx.notOpened}{" "}
            <a href={payUrl} className={styles.fallbackLink}>
              {tx.openPay}
            </a>
          </p>
        )}

        {mode === "pay" && (
          <p className={styles.secure}>
            <Lock />
            {named(tx.secure)}
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}
