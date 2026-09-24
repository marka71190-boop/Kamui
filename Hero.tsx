import { GALLERY } from "@/config/gallery";
import { PRODUCT } from "@/config/site";
import { formatNumber, formatPrice } from "@/lib/format";
import type { Stock } from "@/lib/stock";
import { Signature } from "@/components/signature/Signature";
import { Slider } from "@/components/slider/Slider";
import { ArrowRight } from "@/components/ui/Icons";
import { StockMeter } from "@/components/ui/StockMeter";
import styles from "./Hero.module.css";

export function Hero({ stock }: { stock: Stock }) {
  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={styles.media}>
        <Slider
          slides={GALLERY}
          variant="hero"
          ariaLabel="Фотографии коллекции Kamui × Iosif Abramov"
          sizes="(max-width: 1023px) 100vw, 60vw"
          autoPlay={6500}
          priority
        />
        <div className={styles.shade} aria-hidden="true" />
      </div>

      <div className={`container ${styles.content}`}>
        <p className={styles.eyebrow}>
          <span>Лимитированная серия</span>
          <span className={styles.eyebrowDot} aria-hidden="true" />
          <span>{formatNumber(stock.total)} экземпляров</span>
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
            <Signature trigger="mount" delay={1100} duration={3600} />
          </div>
        </div>

        <div className={styles.cta}>
          <a href="#buy" className="btn">
            Оставить заявку
            <ArrowRight className="btn__arrow" />
          </a>
          <p className={styles.price}>
            <span>Цена</span>
            <b>{formatPrice(PRODUCT.price)}</b>
          </p>
        </div>

        <StockMeter stock={stock} compact className={styles.stock} />
      </div>
    </section>
  );
}
