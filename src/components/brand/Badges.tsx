/**
 * Маленькие анимированные значки:
 *   QualitySeal — печать «Гарантия качества 100%»: вращается кольцо с надписью, прорисовывается галочка;
 *   LaurelBadge — лавровый венок («Выбор чемпиона мира»): собирается по листику, по звезде (или «№1») пробегает блик.
 * Анимация запускается, когда значок появляется на экране (data-reveal → класс is-in).
 * Серверные компоненты без JS; id — уникальная приставка для ссылок внутри SVG (градиенты, контуры).
 */
import styles from "./Badges.module.css";

/** Ветвь венка: кривая снизу вверх (левая половина; правая — зеркально) */
const BRANCH = "M41 96Q17 66 36 22";

/**
 * Листья вдоль ветви: [x, y, угол, масштаб]. Основание листа — на стебле, лист смотрит вверх,
 * по очереди наружу и внутрь венка. Посчитано заранее, чтобы разметка на сервере и в браузере совпадала.
 */
const LEAVES: [number, number, number, number][] = [
  [36.63, 89.86, -160.1, 1],
  [33.59, 84.42, -78.2, 0.85],
  [31.17, 78.78, -148.1, 0.95],
  [29.38, 72.94, -66, 0.8],
  [28.2, 66.89, -136, 0.9],
  [27.65, 60.64, -54.2, 0.75],
  [27.72, 54.19, -124.7, 0.85],
  [28.41, 47.54, -43.6, 0.7],
  [29.72, 40.68, -114.9, 0.8],
  [31.65, 33.62, -34.6, 0.65],
  [36, 22, -66.6, 0.75],
];

/** Лист: основание в (0,0), смотрит вправо */
const LEAF = "M0 0C3 -3.4 7.5 -3.6 11 0C7.5 3.6 3 3.4 0 0Z";

export function QualitySeal({
  id: uid,
  ring,
  center,
  sub,
  label,
  className,
}: {
  id: string;
  ring: string;
  center: string;
  sub: string;
  /** Текст для экранного диктора */
  label: string;
  className?: string;
}) {
  const id = `${uid}-ring`;
  return (
    <svg className={`${styles.badge} ${styles.seal} ${className ?? ""}`} viewBox="0 0 120 120" role="img" aria-label={label} data-reveal>
      <defs>
        <path id={id} d="M13 60a47 47 0 1 1 94 0a47 47 0 1 1 -94 0" />
      </defs>
      <circle className={styles.glow} cx="60" cy="60" r="52" />
      <g className={styles.ring}>
        <circle cx="60" cy="60" r="57" className={styles.ringLine} />
        <text className={styles.ringText} aria-hidden="true">
          <textPath href={`#${id}`} textLength="290" lengthAdjust="spacing">
            {ring}
          </textPath>
        </text>
      </g>
      <circle cx="60" cy="60" r="37" className={styles.core} />
      <circle cx="60" cy="60" r="33.5" className={styles.coreLine} />
      <path className={styles.check} d="M51.5 38l6 6l12 -12" pathLength={1} />
      <text x="60" y="68" className={styles.big} textAnchor="middle" aria-hidden="true">
        {center}
      </text>
      <text x="60" y="80" className={styles.small} textAnchor="middle" aria-hidden="true">
        {sub}
      </text>
    </svg>
  );
}

/** Звезда в центре венка (когда нет крупной надписи) */
const STAR =
  "M60 30.5L63.06 38.79L71.89 39.14L64.95 44.61L67.35 53.11L60 48.2L52.65 53.11L55.05 44.61L48.11 39.14L56.94 38.79Z";

/**
 * Лавровый венок: крупная надпись в центре (center, например «№1») или звезда, под ней 1–3 строки мелкого текста.
 */
export function LaurelBadge({
  id: uid,
  center,
  lines,
  label,
  className,
}: {
  id: string;
  center?: string;
  lines: string[];
  label: string;
  className?: string;
}) {
  const shine = `${uid}-shine`;
  const clip = `${uid}-clip`;
  const mark = center ? (
    <text x="60" y="68" className={styles.number} textAnchor="middle">
      {center}
    </text>
  ) : (
    <path className={styles.star} d={STAR} />
  );
  // строки под надписью или звездой
  const firstLine = center ? 81 : lines.length > 2 ? 63.5 : 68;
  return (
    <svg className={`${styles.badge} ${styles.top} ${className ?? ""}`} viewBox="0 0 120 120" role="img" aria-label={label} data-reveal>
      <defs>
        <linearGradient id={shine} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={clip}>{mark}</clipPath>
      </defs>
      <circle className={styles.glowRed} cx="60" cy="60" r="44" />
      {[1, -1].map((side) => (
        <g key={side} transform={side === -1 ? "translate(120 0) scale(-1 1)" : undefined}>
          <path className={styles.branch} d={BRANCH} pathLength={1} />
          {LEAVES.map(([x, y, a, k], i) => (
            <g key={i} transform={`translate(${x} ${y}) rotate(${a}) scale(${k})`}>
              <path className={styles.leaf} d={LEAF} style={{ animationDelay: `${(0.35 + i * 0.06).toFixed(2)}s` }} />
            </g>
          ))}
        </g>
      ))}
      <g aria-hidden="true">
        {mark}
        {lines.map((line, i) => (
          <text key={i} x="60" y={firstLine + i * 8.5} className={styles.small} textAnchor="middle">
            {line}
          </text>
        ))}
      </g>
      <g clipPath={`url(#${clip})`} aria-hidden="true">
        <rect className={styles.shine} x="20" y="28" width="22" height="52" fill={`url(#${shine})`} />
      </g>
    </svg>
  );
}
