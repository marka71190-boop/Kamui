import { t } from "@/i18n/dict";
import type { Lang } from "@/i18n/lang";
import { formatNumber } from "@/lib/format";
import type { StockView } from "@/lib/stock";
import styles from "./ui.module.css";

/** «Осталось 1 951 из 2 000» + шкала проданных экземпляров. */
export function StockMeter({
  stock,
  compact = false,
  className = "",
  lang = "ru",
}: {
  stock: StockView;
  compact?: boolean;
  className?: string;
  lang?: Lang;
}) {
  const tx = t(lang).stock;
  const soldPct = stock.total > 0 ? Math.min(100, (stock.sold / stock.total) * 100) : 100;
  return (
    <div className={`${styles.stock} ${compact ? styles.stockCompact : ""} ${className}`}>
      <div className={styles.stockRow}>
        <span className={styles.stockLabel}>
          <span className={styles.pulse} aria-hidden="true" />
          {stock.soldOut ? tx.soldOut : tx.left}
        </span>
        {!stock.soldOut && (
          <span className={styles.stockValue}>
            <b>{formatNumber(stock.remaining, lang)}</b> <span>{tx.ofTotal(stock.total)}</span>
          </span>
        )}
      </div>
      <div
        className={styles.bar}
        role="meter"
        aria-label={tx.meter}
        aria-valuemin={0}
        aria-valuemax={stock.total}
        aria-valuenow={stock.sold}
        aria-valuetext={tx.meterText(stock.sold, stock.total)}
      >
        <span className={styles.barFill} style={{ width: `${Math.max(soldPct, 1.2)}%` }} />
      </div>
      {!compact && (
        <p className={styles.stockNote}>
          {tx.note(stock.sold, stock.total)}
        </p>
      )}
    </div>
  );
}
