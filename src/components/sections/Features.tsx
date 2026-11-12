import type { ReactNode } from "react";
import { t } from "@/i18n/dict";
import type { Lang } from "@/i18n/lang";
import { revealDelay } from "@/lib/style";
import { LaurelBadge, QualitySeal } from "@/components/brand/Badges";
import { IconClean, IconCollection, IconControl } from "@/components/ui/Icons";
import styles from "./Features.module.css";

const ICONS: ReactNode[] = [<IconControl key="c" />, <IconClean key="l" />, <IconCollection key="o" />];

export function Features({ lang = "ru" }: { lang?: Lang }) {
  const tx = t(lang).features;
  const FEATURES = tx.cards.map((c, i) => ({ ...c, icon: ICONS[i] }));
  const g = tx.grip;
  return (
    <section id="features" className={`section ${styles.features}`} aria-labelledby="features-title">
      <div className="container">
        <div className={styles.head}>
          <p className="section-label" data-reveal>
            <b>02</b> {tx.label}
          </p>
          <h2 id="features-title" className="section-title" data-reveal>
            {tx.title}
          </h2>
        </div>

        <div className={styles.grip}>
          <div className={styles.gripText} data-reveal>
            <p className={styles.gripEyebrow}>{g.eyebrow}</p>
            <h3 className={styles.gripTitle}>{g.title}</h3>
            <p className={styles.gripBody}>{g.text}</p>
          </div>
          <ul className={styles.badges}>
            <li className={styles.badgeItem} data-reveal style={revealDelay(120)}>
              <LaurelBadge id="grip-top" lines={g.topLines} label={g.topLabel} className={styles.badge} />
              <span className={styles.badgeCaption}>{g.topCaption}</span>
            </li>
            <li className={styles.badgeItem} data-reveal style={revealDelay(240)}>
              <QualitySeal id="grip-seal" ring={g.sealRing} center={g.sealCenter} sub={g.sealSub} label={g.sealLabel} className={styles.badge} />
              <span className={styles.badgeCaption}>{g.sealCaption}</span>
            </li>
          </ul>
        </div>

        <div className={styles.cards}>
          {FEATURES.map((f, i) => (
            <article key={f.title} className={styles.card} data-reveal style={revealDelay(i * 110)}>
              <div className={styles.cardTop}>
                <span className={styles.icon}>{f.icon}</span>
                <span className={styles.index}>0{i + 1}</span>
              </div>
              <h3 className={styles.cardTitle}>{f.title}</h3>
              <div className={styles.cardBody}>{f.body}</div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
