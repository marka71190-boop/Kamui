"use client";

import { useEffect, useId, useRef, useState } from "react";
import { SIGNATURE } from "./signature-data";
import styles from "./Signature.module.css";

interface SignatureProps {
  className?: string;
  /** Пауза перед началом, мс */
  delay?: number;
  /** Длительность прорисовки всей подписи, мс */
  duration?: number;
  /** Когда начинать: сразу после загрузки или при появлении в зоне видимости */
  trigger?: "mount" | "inview";
  /** Показать сразу нарисованной (без анимации) */
  drawn?: boolean;
}

type Phase = "idle" | "drawing" | "done";

const PEN_LIFT_MS = 170;

/**
 * Красная подпись Иосифа Абрамова, которая «пишется ручкой».
 * Точный контур чернил открывается маской, которая идёт по траекториям штрихов
 * в порядке написания; за пером движется светящийся кончик. После завершения
 * маска снимается и подпись остаётся на блоке.
 */
export function Signature({
  className = "",
  delay = 400,
  duration = 3400,
  trigger = "inview",
  drawn = false,
}: SignatureProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const maskId = `sig-mask-${uid}`;
  const gradId = `sig-ink-${uid}`;
  const nibId = `sig-nib-${uid}`;
  const titleId = `sig-title-${uid}`;

  const svgRef = useRef<SVGSVGElement>(null);
  const nibRef = useRef<SVGGElement>(null);
  const [phase, setPhase] = useState<Phase>(drawn ? "done" : "idle");

  useEffect(() => {
    if (drawn) return;
    const svg = svgRef.current;
    if (!svg) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPhase("done");
      return;
    }

    const paths = Array.from(svg.querySelectorAll<SVGPathElement>("[data-stroke]"));
    const lengths = paths.map((p) => p.getTotalLength());

    // Время на каждый штрих пропорционально его длине (длинные — чуть быстрее, как у живой руки).
    const weights = lengths.map((l) => Math.pow(l, 0.82));
    const drawTime = Math.max(600, duration - PEN_LIFT_MS * (paths.length - 1));
    const sum = weights.reduce((a, b) => a + b, 0);
    let cursor = 0;
    const segments = weights.map((w) => {
      const seg = { start: cursor, end: cursor + (drawTime * w) / sum };
      cursor = seg.end + PEN_LIFT_MS;
      return seg;
    });
    const total = segments[segments.length - 1].end;

    paths.forEach((p, i) => {
      p.style.strokeDasharray = `${lengths[i]} ${lengths[i] + 50}`;
      p.style.strokeDashoffset = `${lengths[i]}`;
    });

    // Ход пера внутри штриха: разгон → ровное письмо → торможение.
    const ease = (x: number) => 0.3 * x + 0.7 * (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

    let raf = 0;
    let timer = 0;
    let t0 = 0;

    const frame = (now: number) => {
      if (!t0) t0 = now;
      const elapsed = now - t0;
      let nibPoint: DOMPoint | null = null;

      segments.forEach((s, i) => {
        const k = Math.min(1, Math.max(0, (elapsed - s.start) / (s.end - s.start)));
        const drawnLen = lengths[i] * ease(k);
        const p = paths[i];
        p.style.visibility = k > 0 ? "visible" : "hidden";
        p.style.strokeDashoffset = `${lengths[i] - drawnLen}`;
        if (k > 0 && k < 1) nibPoint = p.getPointAtLength(drawnLen);
      });

      const nib = nibRef.current;
      if (nib) {
        const pt = nibPoint as DOMPoint | null;
        if (pt) nib.setAttribute("transform", `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)})`);
        nib.style.opacity = pt ? "1" : "0";
      }

      if (elapsed < total) raf = requestAnimationFrame(frame);
      else setPhase("done");
    };

    const start = () => {
      timer = window.setTimeout(() => {
        setPhase("drawing");
        raf = requestAnimationFrame(frame);
      }, delay);
    };

    let io: IntersectionObserver | null = null;
    if (trigger === "mount" || !("IntersectionObserver" in window)) start();
    else {
      io = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            io?.disconnect();
            start();
          }
        },
        { threshold: 0.4 },
      );
      io.observe(svg);
    }

    return () => {
      io?.disconnect();
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [delay, duration, trigger, drawn]);

  const { width, height, outline, strokes } = SIGNATURE;

  return (
    <svg
      ref={svgRef}
      className={`${styles.signature} ${className}`}
      data-phase={phase}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-labelledby={titleId}
      focusable="false"
    >
      <title id={titleId}>Подпись Иосифа Абрамова</title>
      <defs>
        <linearGradient id={gradId} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#ff3b3f" />
          <stop offset="0.55" stopColor="#e3161b" />
          <stop offset="1" stopColor="#c90f14" />
        </linearGradient>
        <radialGradient id={nibId}>
          <stop offset="0" stopColor="#fff" stopOpacity="1" />
          <stop offset="0.25" stopColor="#ffd0d0" stopOpacity="0.9" />
          <stop offset="0.6" stopColor="#ff2d32" stopOpacity="0.35" />
          <stop offset="1" stopColor="#ff2d32" stopOpacity="0" />
        </radialGradient>
        {phase !== "done" && (
          <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height}>
            <g fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round">
              {strokes.map((s, i) => (
                <path key={i} data-stroke="" d={s.d} strokeWidth={s.w} visibility="hidden" />
              ))}
            </g>
          </mask>
        )}
      </defs>

      <path
        className={styles.ink}
        d={outline}
        fill={`url(#${gradId})`}
        fillRule="evenodd"
        mask={phase === "done" ? undefined : `url(#${maskId})`}
      />

      <g ref={nibRef} className={styles.nib} style={{ opacity: 0 }} aria-hidden="true">
        <circle r="46" fill={`url(#${nibId})`} />
        <circle r="6.5" fill="#fff" />
      </g>
    </svg>
  );
}
