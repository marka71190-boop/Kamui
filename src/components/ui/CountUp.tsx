"use client";

import { useEffect, useRef, useState } from "react";
import { formatNumber } from "@/lib/format";

/** Число, которое «набегает» при появлении в зоне видимости. Без JS показывается сразу итоговое значение. */
export function CountUp({
  value,
  duration = 1600,
  className,
  lang = "ru",
}: {
  value: number;
  duration?: number;
  className?: string;
  lang?: "ru" | "en";
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);
  const animated = useRef(false);

  useEffect(() => {
    const el = ref.current;
    // Уже «набегало» или анимации отключены — новое значение (живой остаток) показываем сразу
    if (animated.current || !el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      return;
    }
    let raf = 0;
    let started = false;
    setShown(0);
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || started) return;
        started = true;
        animated.current = true;
        io.disconnect();
        const t0 = performance.now();
        const tick = (now: number) => {
          const k = Math.min(1, (now - t0) / duration);
          const eased = 1 - Math.pow(1 - k, 4);
          setShown(Math.round(value * eased));
          if (k < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, duration]);

  return (
    <span ref={ref} className={className} aria-label={formatNumber(value, lang)}>
      <span aria-hidden="true">{formatNumber(shown, lang)}</span>
    </span>
  );
}
