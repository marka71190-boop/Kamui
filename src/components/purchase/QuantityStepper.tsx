"use client";

import { useState } from "react";
import { Minus, Plus } from "@/components/ui/Icons";
import { t } from "@/i18n/dict";
import type { Lang } from "@/i18n/lang";
import styles from "./Purchase.module.css";

interface Props {
  value: number;
  min?: number;
  max: number;
  onChange: (v: number) => void;
  labelledBy: string;
  disabled?: boolean;
  lang?: Lang;
}

/** [-] 1 [+] — число можно и ввести с клавиатуры (удобно для оптовых заказов: 10, 25, 50 шт.) */
export function QuantityStepper({ value, min = 1, max, onChange, labelledBy, disabled, lang = "ru" }: Props) {
  const tx = t(lang).qty;
  /** Что набрано в поле, пока покупатель вводит число (пустое поле — можно стереть и набрать заново) */
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  return (
    <div className={styles.stepper} role="group" aria-labelledby={labelledBy}>
      <button
        type="button"
        className={styles.stepBtn}
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={disabled || value <= min}
        aria-label={tx.less}
      >
        <Minus />
      </button>
      <input
        className={styles.stepValue}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        maxLength={3}
        aria-labelledby={labelledBy}
        disabled={disabled}
        value={draft ?? String(value)}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, 3);
          // больше максимума — сразу показываем максимум
          setDraft(digits && Number(digits) > max ? String(max) : digits);
          if (digits) onChange(clamp(Number(digits)));
        }}
        onBlur={() => setDraft(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") {
            e.preventDefault();
            onChange(clamp(value + 1));
            setDraft(null);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            onChange(clamp(value - 1));
            setDraft(null);
          } else if (e.key === "Enter") {
            // Enter в поле количества не отправляет форму
            e.preventDefault();
            setDraft(null);
            e.currentTarget.blur();
          }
        }}
      />
      <button
        type="button"
        className={styles.stepBtn}
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={disabled || value >= max}
        aria-label={tx.more}
      >
        <Plus />
      </button>
    </div>
  );
}
