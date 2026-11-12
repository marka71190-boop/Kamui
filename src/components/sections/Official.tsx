import { t } from "@/i18n/dict";
import type { Lang } from "@/i18n/lang";
import { revealDelay } from "@/lib/style";
import { AbramovLogo } from "@/components/brand/AbramovLogo";
import styles from "./Official.module.css";

/** «Официальный дистрибьютор»: анимированный логотип Abramov Shop и гарантия качества */
export function Official({ lang = "ru" }: { lang?: Lang }) {
  const tx = t(lang).official;
  return (
    <section id="official" className={`section ${styles.official}`} aria-labelledby="official-title">
      <div className={`container ${styles.grid}`}>
        <div className={styles.visual}>
          <div className={styles.panel}>
            <span className={`${styles.corner} ${styles.cornerTl}`} aria-hidden="true" />
            <span className={`${styles.corner} ${styles.cornerBr}`} aria-hidden="true" />
            <AbramovLogo id="official-logo" className={styles.logo} title={tx.logo} />
            <p className={styles.caption} data-reveal style={revealDelay(900)}>
              {tx.caption}
            </p>
          </div>
        </div>

        <div className={styles.text}>
          <p className="section-label" data-reveal>
            <b>05</b> {tx.label}
          </p>
          <h2 id="official-title" className={`section-title ${styles.title}`} data-reveal>
            {tx.title}
          </h2>
          <p className={`lead ${styles.lead}`} data-reveal>
            {tx.lead}
          </p>
          <p className={styles.accent} data-reveal>
            {tx.accent}
          </p>
          <ul className={styles.points}>
            {tx.points.map((p, i) => (
              <li key={p.title} className={styles.point} data-reveal style={revealDelay(i * 110)}>
                <svg className={styles.pointIcon} viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="10.5" />
                  <path d="M7.5 12.3l3 3 6-6.3" pathLength={1} />
                </svg>
                <span>
                  <b>{p.title}</b>
                  {p.text}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
