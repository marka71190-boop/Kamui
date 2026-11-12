import { t } from "@/i18n/dict";
import type { Lang } from "@/i18n/lang";
import { formatNumber } from "@/lib/format";
import type { StockView } from "@/lib/stock";
import { revealDelay } from "@/lib/style";
import { LiveAvailability } from "@/components/stock/LiveAvailability";
import styles from "./Collection.module.css";

export function Collection({ stock, lang = "ru" }: { stock: StockView; lang?: Lang }) {
  const tx = t(lang).collection;
  return (
    <section id="collection" className={`section ${styles.collection}`} aria-labelledby="collection-title">
      <div className={`container ${styles.grid}`}>
        <div className={styles.text}>
          <p className="section-label" data-reveal>
            <b>01</b> {tx.label}
          </p>
          <h2 id="collection-title" className="section-title" data-reveal>
            {tx.title}
          </h2>
          <div className={styles.copy}>
            <p className="lead" data-reveal>
              {tx.lead1}
            </p>
            <p className="lead" data-reveal style={revealDelay(100)}>
              {tx.lead2}
            </p>
            <p className={styles.total} data-reveal style={revealDelay(180)}>
              {tx.total(stock.total)}
            </p>
          </div>
        </div>

        <dl className={styles.facts}>
          <div className={styles.fact} data-reveal>
            <dt>{tx.editionTerm}</dt>
            <dd>
              <span className={styles.num}>{formatNumber(stock.total, lang)}</span>
              <span className={styles.unit}>{tx.editionUnit}</span>
            </dd>
          </div>
          <div className={`${styles.fact} ${styles.factAccent}`} data-reveal style={revealDelay(90)}>
            <dt>{tx.availableTerm}</dt>
            <dd>
              <LiveAvailability stock={stock} lang={lang} numClassName={styles.num} unitClassName={styles.unit} />
            </dd>
          </div>
          <div className={styles.fact} data-reveal style={revealDelay(180)}>
            <dt>{tx.madeTerm}</dt>
            <dd>
              <span className={styles.num}>Japan</span>
              <span className={styles.unit}>{tx.madeUnit}</span>
            </dd>
          </div>
          <div className={styles.fact} data-reveal style={revealDelay(270)}>
            <dt>{tx.modelTerm}</dt>
            <dd>
              <span className={styles.num}>0.98 β</span>
              <span className={styles.unit}>Pyramid · Limited Edition</span>
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
