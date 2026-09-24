import { Fragment } from "react";
import styles from "./ui.module.css";

const ITEMS = ["Limited Edition", "2000 pcs", "Made in Japan", "Kamui × Iosif Abramov", "0.98 β", "Pyramid"];

/** Бегущая строка между первым экраном и контентом. */
export function Marquee() {
  const row = (
    <div className={styles.marqueeGroup}>
      {ITEMS.map((item) => (
        <Fragment key={item}>
          <span className={item === "0.98 β" ? styles.marqueeAccent : undefined}>{item}</span>
          <span className={styles.marqueeDot} aria-hidden="true" />
        </Fragment>
      ))}
    </div>
  );
  return (
    <div className={styles.marquee} aria-hidden="true">
      <div className={styles.marqueeTrack}>
        {row}
        {row}
      </div>
    </div>
  );
}
