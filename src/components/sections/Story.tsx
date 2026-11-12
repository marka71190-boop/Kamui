import { Fragment } from "react";
import { t } from "@/i18n/dict";
import type { Lang } from "@/i18n/lang";
import { revealDelay } from "@/lib/style";
import styles from "./Story.module.css";

export function Story({ lang = "ru" }: { lang?: Lang }) {
  const tx = t(lang).story;
  const FORMULA = tx.formula;
  return (
    <section id="story" className={`section ${styles.story}`} aria-labelledby="story-title">
      <div className="container">
        <p className="section-label" data-reveal>
          <b>03</b> {tx.label}
        </p>
        <h2 id="story-title" className="section-title" data-reveal>
          {tx.title}
        </h2>

        <div className={styles.columns}>
          <article className={styles.block} data-reveal>
            <p className={styles.kicker}>
              <span className={styles.kickerNum}>A</span> {tx.problem}
            </p>
            <p className={styles.text}>{tx.problemText}</p>
          </article>

          <div className={styles.arrow} aria-hidden="true">
            <span />
          </div>

          <article className={`${styles.block} ${styles.solution}`} data-reveal style={revealDelay(120)}>
            <p className={styles.kicker}>
              <span className={styles.kickerNum}>B</span> {tx.solution}
            </p>
            <p className={styles.text}>{tx.solutionText}</p>
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
