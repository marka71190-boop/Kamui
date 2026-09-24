import { formatNumber } from "@/lib/format";
import type { Stock } from "@/lib/stock";
import { revealDelay } from "@/lib/style";
import { CountUp } from "@/components/ui/CountUp";
import styles from "./Collection.module.css";

export function Collection({ stock }: { stock: Stock }) {
  return (
    <section id="collection" className={`section ${styles.collection}`} aria-labelledby="collection-title">
      <div className={`container ${styles.grid}`}>
        <div className={styles.text}>
          <p className="section-label" data-reveal>
            <b>01</b> Коллекция
          </p>
          <h2 id="collection-title" className="section-title" data-reveal>
            Не расходник.
            <br />
            <span className="red">Экземпляр</span> коллекции.
          </h2>
          <div className={styles.copy}>
            <p className="lead" data-reveal>
              <strong>Kamui × Iosif Abramov</strong> — это лимитированная серия мела, созданная для игроков, которые
              чувствуют разницу между обычным ударом и идеальным контролем.
            </p>
            <p className="lead" data-reveal style={revealDelay(100)}>
              Каждый экземпляр объединяет японские технологии Kamui и опыт одного из сильнейших игроков современного
              бильярда.
            </p>
            <p className={styles.total} data-reveal style={revealDelay(180)}>
              Всего создано <b>{formatNumber(stock.total)}</b> экземпляров.
            </p>
          </div>
        </div>

        <dl className={styles.facts}>
          <div className={styles.fact} data-reveal>
            <dt>Тираж</dt>
            <dd>
              <span className={styles.num}>{formatNumber(stock.total)}</span>
              <span className={styles.unit}>экземпляров во всей серии</span>
            </dd>
          </div>
          <div className={`${styles.fact} ${styles.factAccent}`} data-reveal style={revealDelay(90)}>
            <dt>Доступно сейчас</dt>
            <dd>
              <CountUp value={stock.remaining} className={styles.num} />
              <span className={styles.unit}>осталось · продано {formatNumber(stock.sold)}</span>
            </dd>
          </div>
          <div className={styles.fact} data-reveal style={revealDelay(180)}>
            <dt>Производство</dt>
            <dd>
              <span className={styles.num}>Japan</span>
              <span className={styles.unit}>технологии Kamui</span>
            </dd>
          </div>
          <div className={styles.fact} data-reveal style={revealDelay(270)}>
            <dt>Модель</dt>
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
