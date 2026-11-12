import { t } from "@/i18n/dict";
import { RU_MARKET, type Market } from "@/i18n/market";
import { formatMoney } from "@/lib/format";
import { KitShowcase } from "./KitShowcase";
import styles from "./Kit.module.css";

/** «Подарочный набор»: анимация — вещи по очереди ложатся в коробку, состав набора, выбор наклейки JOS */
export function Kit({ market = RU_MARKET }: { market?: Market }) {
  const lang = market.lang;
  const tx = t(lang).kit;
  return (
    <section id="kit" className={`section ${styles.kit}`} aria-labelledby="kit-title">
      <div className="container">
        <KitShowcase
          lang={lang}
          price={formatMoney(market.kitPrice, market.currency)}
          head={
            <>
              <p className="section-label" data-reveal>
                <b>06</b> {tx.label}
              </p>
              <h2 id="kit-title" className={`section-title ${styles.title}`} data-reveal>
                {tx.title}
              </h2>
              <p className={`lead ${styles.lead}`} data-reveal>
                {tx.lead}
              </p>
            </>
          }
        />
      </div>
    </section>
  );
}
