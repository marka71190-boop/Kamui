/**
 * Анимированный логотип Abramov Shop.
 * Когда логотип появляется на экране (data-reveal → класс is-in):
 *   золотой знак прорисовывается контуром и заливается, серая полоса «съезжает» на место,
 *   буквы ABRAMOV появляются по одной, в конце по логотипу один раз пробегает узкий блик.
 * При «уменьшении движения» сразу показывается готовый логотип.
 * Серверный компонент без JS; id — уникальная приставка для градиента и контура блика.
 */
import { ABRAMOV_LOGO as L } from "./abramovLogoPaths";
import styles from "./AbramovLogo.module.css";

export function AbramovLogo({ id, className, title = "Abramov Shop" }: { id: string; className?: string; title?: string }) {
  const shine = `${id}-shine`;
  const shape = `${id}-shape`;
  return (
    <svg
      className={`${styles.logo} ${className ?? ""}`}
      viewBox={L.viewBox}
      role="img"
      aria-label={title}
      data-reveal
    >
      <defs>
        <linearGradient id={shine} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.7" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={shape}>
          <path d={L.mark} />
          <path d={L.bar} />
          {L.letters.map((d, i) => (
            <path key={i} d={d} clipRule="evenodd" />
          ))}
        </clipPath>
      </defs>

      <path className={styles.bar} d={L.bar} fill={L.gray} />
      <path className={styles.markFill} d={L.mark} fill={L.gold} />
      <path className={styles.markLine} d={L.mark} pathLength={1} fill="none" stroke={L.gold} />
      <g fill={L.gold} fillRule="evenodd">
        {L.letters.map((d, i) => (
          <path key={i} className={styles.letter} d={d} style={{ animationDelay: `${1.35 + i * 0.07}s` }} />
        ))}
      </g>

      {/* Блик по всему логотипу */}
      <g clipPath={`url(#${shape})`} aria-hidden="true">
        <rect className={styles.shine} x="-20" y="140" width="56" height="340" fill={`url(#${shine})`} />
      </g>
    </svg>
  );
}
