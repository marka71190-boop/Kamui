import { galleryFor } from "@/config/gallery";
import { t } from "@/i18n/dict";
import { RU_MARKET, type Market } from "@/i18n/market";
import { formatMoney } from "@/lib/format";
import type { StockView } from "@/lib/stock";
import { Signature } from "@/components/signature/Signature";
import { Slider } from "@/components/slider/Slider";
import { ArrowRight } from "@/components/ui/Icons";
import { LiveStockMeter } from "@/components/stock/LiveStockMeter";
import styles from "./Hero.module.css";

/** Маленькие значки у преимуществ: звезда (№1), щит с галочкой (гарантия), медаль (официальный дистрибьютор) */
const TRUST_ICONS = [
  <svg key="top" className={`${styles.trustIcon} ${styles.iconTop}`} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2.8l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.6l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z" />
  </svg>,
  <svg key="seal" className={`${styles.trustIcon} ${styles.iconSeal}`} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2.5l7.5 3v5.7c0 4.6-3.1 8.6-7.5 10.3-4.4-1.7-7.5-5.7-7.5-10.3V5.5z" />
    <path className={styles.iconCheck} d="M8.3 12.2l2.6 2.6 5-5.2" pathLength={1} />
  </svg>,
  <svg key="official" className={`${styles.trustIcon} ${styles.iconOfficial}`} viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="9.5" r="6.2" />
    <path d="M8.6 14.6L7 21.5l5-2.6 5 2.6-1.6-6.9" />
    <path d="M9.6 11.6L12 6.8l2.4 4.8" />
  </svg>,
];

export function Hero({ stock, market = RU_MARKET }: { stock: StockView; market?: Market }) {
  const lang = market.lang;
  const tx = t(lang).hero;
  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={styles.media}>
        <Slider
          slides={galleryFor(lang)}
          variant="hero"
          lang={lang}
          ariaLabel={tx.sliderAria}
          sizes="(max-width: 1023px) 100vw, 60vw"
          autoPlay={6500}
          priority
        />
        <div className={styles.shade} aria-hidden="true" />
      </div>

      <div className={`container ${styles.content}`}>
        <p className={styles.eyebrow}>
          <span>{tx.eyebrow}</span>
          <span className={styles.eyebrowDot} aria-hidden="true" />
          <span>{tx.pieces(stock.total)}</span>
        </p>

        <div className={styles.titleBlock}>
          <h1 id="hero-title" className={styles.title}>
            <span className={styles.line}>
              Kamui <span className={styles.x}>×</span>
            </span>
            <span className={styles.line}>Iosif Abramov</span>
            <span className="visually-hidden"> — </span>
            <span className={styles.edition}>Limited Edition</span>
            <span className={styles.model}>0.98 β</span>
          </h1>
          <div className={styles.signature}>
            <Signature trigger="mount" delay={1100} duration={3600} lang={lang} />
          </div>
        </div>

        <div className={styles.cta}>
          <a href="#buy" className="btn">
            {tx.cta}
            <ArrowRight className="btn__arrow" />
          </a>
          <p className={styles.price}>
            <span>{tx.price}</span>
            <b>{formatMoney(market.unitPrice, market.currency)}</b>
          </p>
        </div>

        <LiveStockMeter stock={stock} compact className={styles.stock} lang={lang} />

        <ul className={styles.trust} aria-label={tx.trustAria}>
          {tx.trust.map((text, i) => (
            <li key={text} className={styles.trustItem} style={{ animationDelay: `${0.95 + i * 0.12}s` }}>
              {TRUST_ICONS[i]}
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
