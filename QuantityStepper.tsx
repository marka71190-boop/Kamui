"use client";

import { Minus, Plus } from "@/components/ui/Icons";
import styles from "./Purchase.module.css";

interface Props {
  value: number;
  min?: number;
  max: number;
  onChange: (v: number) => void;
  labelledBy: string;
  disabled?: boolean;
}

/** [-] 1 [+] */
export function QuantityStepper({ value, min = 1, max, onChange, labelledBy, disabled }: Props) {
  return (
    <div className={styles.stepper} role="group" aria-labelledby={labelledBy}>
      <button
        type="button"
        className={styles.stepBtn}
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={disabled || value <= min}
        aria-label="Уменьшить количество"
      >
        <Minus />
      </button>
      <output className={styles.stepValue} aria-live="polite" aria-label={`${value} шт.`}>
        {value}
      </output>
      <button
        type="button"
        className={styles.stepBtn}
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={disabled || value >= max}
        aria-label="Увеличить количество"
      >
        <Plus />
      </button>
    </div>
  );
}
