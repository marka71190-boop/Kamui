import { formatNumber } from "@/lib/format";
import type { Stock } from "@/lib/stock";
import styles from "./ui.module.css";

/** «Осталось 1 951 из 2 000» + шкала проданных экземпляров. */
export function StockMeter({
  stock,
  compact = false,
  className = "",
}: {
  stock: Stock;
  compact?: boolean;
  className?: string;
}) {
  const soldPct = stock.total > 0 ? Math.min(100, (stock.sold / stock.total) * 100) : 100;
  return (
    <div className={`${styles.stock} ${compact ? styles.stockCompact : ""} ${className}`}>
      <div className={styles.stockRow}>
        <span className={styles.stockLabel}>
          <span className={styles.pulse} aria-hidden="true" />
          {stock.soldOut ? "Тираж распродан" : "Осталось"}
        </span>
        {!stock.soldOut && (
          <span className={styles.stockValue}>
            <b>{formatNumber(stock.remaining)}</b> <span>шт. из {formatNumber(stock.total)}</span>
          </span>
        )}
      </div>
      <div
        className={styles.bar}
        role="meter"
        aria-label="Продано экземпляров"
        aria-valuemin={0}
        aria-valuemax={stock.total}
        aria-valuenow={stock.sold}
        aria-valuetext={`Продано ${stock.sold} из ${stock.total}`}
      >
        <span className={styles.barFill} style={{ width: `${Math.max(soldPct, 1.2)}%` }} />
      </div>
      {!compact && (
        <p className={styles.stockNote}>
          Продано {formatNumber(stock.sold)} из {formatNumber(stock.total)} экземпляров
        </p>
      )}
    </div>
  );
}
