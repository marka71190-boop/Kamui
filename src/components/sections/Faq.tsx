import { t } from "@/i18n/dict";
import type { Lang } from "@/i18n/lang";
import { revealDelay } from "@/lib/style";
import { Plus } from "@/components/ui/Icons";
import styles from "./Faq.module.css";

/**
 * Вопросы и ответы о меле. Ответы лежат в HTML даже в свёрнутом виде (details/summary),
 * поэтому поисковики видят весь текст. Тот же текст — в разметке FAQPage (src/lib/seo.ts).
 */
export function Faq({
  lang = "ru",
  price,
  countries,
  robokassa,
  abroadPrice,
  kitPrice,
  wholesalePrice,
  abroadWholesale,
}: {
  lang?: Lang;
  price: string;
  countries?: readonly string[];
  robokassa?: boolean;
  /** Цена для заказов из-за рубежа, «$48» */
  abroadPrice?: string;
  /** Цена подарочного набора, «6 000 ₽» */
  kitPrice?: string;
  /** Оптовая цена мела от 10 шт., «3 000 ₽», и для заказов из-за рубежа, «$41» */
  wholesalePrice?: string;
  abroadWholesale?: string;
}) {
  const tx = t(lang).faq;
  const items = tx.items(price, countries, robokassa, abroadPrice, kitPrice, wholesalePrice, abroadWholesale);
  return (
    <section id="faq" className={`section ${styles.faq}`} aria-labelledby="faq-title">
      <div className={`container ${styles.grid}`}>
        <div>
          <p className="section-label" data-reveal>
            <b>08</b> {tx.label}
          </p>
          <h2 id="faq-title" className={`section-title ${styles.title}`} data-reveal>
            {tx.title}
          </h2>
        </div>

        <div className={styles.list}>
          {items.map((item, i) => (
            <details key={item.q} className={styles.item} data-reveal style={revealDelay(Math.min(i, 4) * 60)}>
              <summary className={styles.question}>
                <h3>{item.q}</h3>
                <Plus className={styles.icon} />
              </summary>
              <p className={styles.answer}>{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
