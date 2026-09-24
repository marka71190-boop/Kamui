"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { GalleryPhoto } from "@/config/gallery";
import { pad2 } from "@/lib/format";
import { ChevronLeft, ChevronRight } from "@/components/ui/Icons";
import styles from "./Slider.module.css";

interface SliderProps {
  slides: GalleryPhoto[];
  /** hero — фон первого экрана (cover); lightbox — полноэкранный просмотр (contain) */
  variant?: "hero" | "lightbox";
  ariaLabel: string;
  sizes: string;
  initialIndex?: number;
  /** Интервал автопрокрутки, мс (false — выключена) */
  autoPlay?: number | false;
  /** Первый слайд — главный кадр страницы (грузится с высоким приоритетом) */
  priority?: boolean;
  className?: string;
  onIndexChange?: (index: number) => void;
}

interface DragState {
  x: number;
  y: number;
  t: number;
  id: number;
  axis: "x" | "y" | null;
}

/**
 * Галерея: свайп на телефоне, стрелки и клавиатура на компьютере,
 * точки-индикаторы, плавное переключение, автопрокрутка с паузой при наведении.
 */
export function Slider({
  slides,
  variant = "hero",
  ariaLabel,
  sizes,
  initialIndex = 0,
  autoPlay = false,
  priority = false,
  className = "",
  onIndexChange,
}: SliderProps) {
  const count = slides.length;
  const [index, setIndex] = useState(initialIndex);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pageHidden, setPageHidden] = useState(false);
  const [reduced, setReduced] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);

  const go = useCallback((i: number) => setIndex(((i % count) + count) % count), [count]);

  useEffect(() => {
    onIndexChange?.(index);
  }, [index, onIndexChange]);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const onVis = () => setPageHidden(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const playing = Boolean(autoPlay) && !hovered && !dragging && !pageHidden && !reduced && count > 1;

  useEffect(() => {
    if (!playing || !autoPlay) return;
    const t = window.setTimeout(() => go(index + 1), autoPlay);
    return () => window.clearTimeout(t);
  }, [playing, autoPlay, index, go]);

  // ----- свайп / перетаскивание -----
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (count < 2 || (e.pointerType === "mouse" && e.button !== 0)) return;
    drag.current = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, axis: null };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.axis && Math.hypot(dx, dy) > 8) {
      d.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (d.axis === "x") {
        viewportRef.current?.setPointerCapture(e.pointerId);
        setDragging(true);
      }
    }
    if (d.axis === "x") {
      // сопротивление на краях не нужно — галерея зациклена
      setDragX(dx);
    }
  };

  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.axis !== "x") return;
    const dx = e.clientX - d.x;
    const width = viewportRef.current?.offsetWidth ?? 1;
    const velocity = Math.abs(dx) / Math.max(1, performance.now() - d.t);
    if (Math.abs(dx) > width * 0.16 || (velocity > 0.45 && Math.abs(dx) > 24)) go(index + (dx < 0 ? 1 : -1));
    setDragging(false);
    setDragX(0);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      go(index + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(index - 1);
    }
  };

  const current = slides[index];

  return (
    <div
      className={`${styles.slider} ${styles[variant]} ${className}`}
      role="region"
      aria-roledescription="carousel"
      aria-label={ariaLabel}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        ref={viewportRef}
        className={styles.viewport}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        data-dragging={dragging || undefined}
      >
        <div
          className={styles.track}
          style={{
            transform: `translate3d(calc(${-index * 100}% + ${dragX}px), 0, 0)`,
            transition: dragging ? "none" : undefined,
          }}
          aria-live={playing ? "off" : "polite"}
        >
          {slides.map((s, i) => {
            const eager = priority && i === 0;
            return (
              <div
                key={s.caption}
                className={`${styles.slide} ${i === index ? styles.active : ""}`}
                role="group"
                aria-roledescription="slide"
                aria-label={`${i + 1} из ${count}: ${s.caption}`}
                aria-hidden={i !== index}
              >
                <Image
                  src={s.src}
                  alt={s.alt}
                  fill
                  sizes={sizes}
                  placeholder="blur"
                  draggable={false}
                  loading={eager || variant === "lightbox" ? "eager" : "lazy"}
                  fetchPriority={eager ? "high" : undefined}
                  className={styles.image}
                />
              </div>
            );
          })}
        </div>
      </div>

      {count > 1 && (
        <>
          <div className={styles.arrows}>
            <button type="button" className={styles.arrow} onClick={() => go(index - 1)} aria-label="Предыдущее фото">
              <ChevronLeft />
            </button>
            <button type="button" className={styles.arrow} onClick={() => go(index + 1)} aria-label="Следующее фото">
              <ChevronRight />
            </button>
          </div>

          <div className={styles.meta}>
            <p className={styles.counter} aria-hidden="true">
              <b>{pad2(index + 1)}</b>
              <span>/ {pad2(count)}</span>
              <em>{current.caption}</em>
            </p>
            <div className={styles.dots}>
              {slides.map((s, i) => (
                <button
                  key={s.caption}
                  type="button"
                  className={styles.dot}
                  onClick={() => go(i)}
                  aria-label={`Фото ${i + 1}: ${s.caption}`}
                  aria-current={i === index ? "true" : undefined}
                >
                  <span
                    key={i === index ? `on-${index}` : "off"}
                    className={styles.dotFill}
                    data-playing={i === index && playing ? "" : undefined}
                    style={autoPlay ? { animationDuration: `${autoPlay}ms` } : undefined}
                  />
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
