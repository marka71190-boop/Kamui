import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

const base = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const ArrowRight = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 12h15M13 6l6 6-6 6" />
  </svg>
);

export const ChevronLeft = (p: P) => (
  <svg {...base} {...p}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
);

export const ChevronRight = (p: P) => (
  <svg {...base} {...p}>
    <path d="M9 5l7 7-7 7" />
  </svg>
);

export const Close = (p: P) => (
  <svg {...base} {...p}>
    <path d="M5 5l14 14M19 5L5 19" />
  </svg>
);

export const Plus = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const Minus = (p: P) => (
  <svg {...base} {...p}>
    <path d="M5 12h14" />
  </svg>
);

export const Check = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4.5 12.5l5 5 10-11" />
  </svg>
);

export const Expand = (p: P) => (
  <svg {...base} {...p}>
    <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />
  </svg>
);

/** Прицел — «Контроль» */
export const IconControl = (p: P) => (
  <svg {...base} viewBox="0 0 48 48" width={48} height={48} strokeWidth={1.4} {...p}>
    <circle cx="24" cy="24" r="17" />
    <circle cx="24" cy="24" r="8" />
    <circle cx="24" cy="24" r="1.6" fill="currentColor" stroke="none" />
    <path d="M24 2v8M24 38v8M2 24h8M38 24h8" />
  </svg>
);

/** Чистая поверхность — «Чистота игры» */
export const IconClean = (p: P) => (
  <svg {...base} viewBox="0 0 48 48" width={48} height={48} strokeWidth={1.4} {...p}>
    <path d="M6 34h36" />
    <path d="M10 40h28" opacity=".5" />
    <path d="M24 6c5 7 9 11.5 9 16.5a9 9 0 0 1-18 0C15 17.5 19 13 24 6z" />
    <path d="M20 23.5a4 4 0 0 0 4 4" />
  </svg>
);

/** Номерной знак — «Коллекция» */
export const IconCollection = (p: P) => (
  <svg {...base} viewBox="0 0 48 48" width={48} height={48} strokeWidth={1.4} {...p}>
    <path d="M24 4l5.6 4.1 6.9-.2 2.1 6.6 5.6 4-2.2 6.5 2.2 6.6-5.6 4-2.1 6.6-6.9-.2L24 46l-5.6-4.1-6.9.2-2.1-6.6-5.6-4 2.2-6.6-2.2-6.5 5.6-4 2.1-6.6 6.9.2z" />
    <path d="M18 29V19l6 10V19M28 25h4M28 29h4" />
  </svg>
);
