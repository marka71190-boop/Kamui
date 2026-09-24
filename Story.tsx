import { Fragment } from "react";
import { revealDelay } from "@/lib/style";
import styles from "./Story.module.css";

const FORMULA = [
  { term: "Сцепление", note: "уверенный контакт наклейки с шаром" },
  { term: "Стабильность", note: "предсказуемый удар от партии к партии" },
  { term: "Чистота", note: "меньше следов на сукне, руках и кие" },
];

export function Story() {
  return (
    <section id="story" className={`section ${styles.story}`} aria-labelledby="story-title">
      <div className="container">
        <p className="section-label" data-reveal>
          <b>03</b> История создания
        </p>
        <h2 id="story-title" className="section-title" data-reveal>
          Почему появился
          <br />
          этот мел
        </h2>

        <div className={styles.columns}>
          <article className={styles.block} data-reveal>
            <p className={styles.kicker}>
              <span className={styles.kickerNum}>A</span> Проблема
            </p>
            <p className={styles.text}>Игроки хотели больше контроля, но обычный мел оставлял много следов.</p>
          </article>

          <div className={styles.arrow} aria-hidden="true">
            <span />
          </div>

          <article className={`${styles.block} ${styles.solution}`} data-reveal style={revealDelay(120)}>
            <p className={styles.kicker}>
              <span className={styles.kickerNum}>B</span> Решение
            </p>
            <p className={styles.text}>Создать формулу, которая сочетает сцепление, стабильность и чистоту.</p>
          </article>
        </div>

        <div className={styles.formula} data-reveal>
          {FORMULA.map((f, i) => (
            <Fragment key={f.term}>
              <div className={styles.term}>
                <span className={styles.termWord}>{f.term}</span>
                <span className={styles.termNote}>{f.note}</span>
              </div>
              <span className={styles.op} aria-hidden="true">
                {i < FORMULA.length - 1 ? "+" : "="}
              </span>
            </Fragment>
          ))}
          <div className={`${styles.term} ${styles.result}`}>
            <span className={styles.termWord}>0.98 β</span>
            <span className={styles.termNote}>Kamui × Iosif Abramov</span>
          </div>
        </div>
      </div>
    </section>
  );
}
