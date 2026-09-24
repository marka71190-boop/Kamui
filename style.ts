import type { CSSProperties } from "react";

/** Задержка появления блока при прокрутке (см. [data-reveal] в globals.css). */
export const revealDelay = (ms: number) => ({ "--reveal-delay": `${ms}ms` }) as CSSProperties;
