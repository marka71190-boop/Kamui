"use client";

/**
 * Анимация подарочного набора: пустая коробка, затем каждая вещь по очереди показывается крупно
 * (по отдельному фото), опускается в коробку и ложится на своё место; в списке справа загорается
 * то, что только что легло в коробку. Как устроена анимация — kitAnimation.ts.
 * Запускается, когда коробка появляется на экране; кнопка «Повторить» проигрывает заново.
 * Без JS и при «уменьшении движения» сразу виден собранный набор.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { KIT_BOX, KIT_EVENT, KIT_FRONT, KIT_LAYERS, KIT_SHOW } from "@/config/kit-visual";
import { KIT_TIPS } from "@/config/products";
import { t } from "@/i18n/dict";
import type { Lang } from "@/i18n/lang";
import { ArrowRight } from "@/components/ui/Icons";
import { kitTimeline, playKit, whenImagesReady } from "./kitAnimation";
import styles from "./Kit.module.css";

const pct = (n: number) => `${n}%`;
/** sizes для картинки шириной w % кадра: на телефоне кадр во всю ширину, на компьютере — около половины */
const sizesFor = (w: number) => `(max-width: 960px) ${Math.ceil(w)}vw, ${Math.ceil(w * 0.55)}vw`;

const TOTAL_MS = kitTimeline(KIT_SHOW).total * 1000;

export function KitShowcase({ lang, price, head }: { lang: Lang; price: string; head: ReactNode }) {
  const tx = t(lang).kit;
  /** Запуск — когда видно саму коробку (весь блок на телефоне выше экрана) */
  const stageRef = useRef<HTMLDivElement>(null);
  /** Сцена текущего прогона (пересоздаётся при «Повторить») */
  const sceneRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  /** Номер прогона: меняется при «Повторить» — анимация начинается заново */
  const [run, setRun] = useState(0);
  /** Анимации нет (уменьшение движения / старый браузер) — сразу собранный набор */
  const [still, setStill] = useState(false);
  /** Прогон закончился — показываем «Повторить» */
  const [done, setDone] = useState(false);
  const [tip, setTip] = useState("");

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) {
      setRun(1);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setRun((r) => (r === 0 ? 1 : r));
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (run === 0) return;
    const scene = sceneRef.current;
    if (!scene) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || typeof scene.animate !== "function") {
      setStill(true);
      return;
    }
    setDone(false);
    let cancelled = false;
    let anims: Animation[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    whenImagesReady(scene, 2500).then(() => {
      if (cancelled) return;
      anims = playKit(scene, listRef.current, KIT_SHOW);
      timer = setTimeout(() => setDone(true), TOTAL_MS);
    });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      anims.forEach((a) => a.cancel());
    };
  }, [run]);

  const order = () => {
    window.dispatchEvent(new CustomEvent(KIT_EVENT, { detail: { tip } }));
    // к выбору товара в форме (если форма уже открыта — к ней же)
    (document.getElementById("order-product") ?? document.getElementById("buy"))?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  return (
    <div className={styles.showcase} data-still={still || undefined}>
      <div className={styles.head}>{head}</div>
      <div ref={stageRef} className={styles.stageWrap}>
        <div key={run} ref={sceneRef} className={styles.stage} role="img" aria-label={tx.stageAria}>
          <Image src={KIT_BOX} alt="" fill sizes={sizesFor(100)} className={styles.base} />
          {KIT_LAYERS.map((l) => (
            <div
              key={l.id}
              data-layer={l.id}
              className={`${styles.layer} ${styles[l.id]}`}
              style={{ left: pct(l.left), top: pct(l.top), width: pct(l.width), height: pct(l.height) }}
            >
              <Image src={l.src} alt="" fill sizes={sizesFor(l.width)} />
            </div>
          ))}
          <div
            className={styles.front}
            style={{ left: pct(KIT_FRONT.left), top: pct(KIT_FRONT.top), width: pct(KIT_FRONT.width), height: pct(KIT_FRONT.height) }}
          >
            <Image src={KIT_FRONT.src} alt="" fill sizes={sizesFor(KIT_FRONT.width)} />
          </div>
          <span className={styles.dim} data-dim aria-hidden="true" />
          {KIT_SHOW.map((s) => (
            <div
              key={s.id}
              data-show={s.id}
              className={s.fold ? `${styles.show} ${styles.showFold}` : styles.show}
              style={{ left: pct(s.left), top: pct(s.top), width: pct(s.width), height: pct(s.height) }}
              aria-hidden="true"
            >
              {s.fold ? (
                <>
                  {/* салфетка: левая часть (с вышивкой) и правая, которая складывается назад */}
                  <div className={styles.half} style={{ width: pct(s.fold * 100) }}>
                    <div className={styles.halfImg} style={{ width: pct(100 / s.fold) }}>
                      <Image src={s.src} alt="" fill sizes={sizesFor(s.width)} />
                    </div>
                  </div>
                  <div className={`${styles.half} ${styles.flap}`} data-fold style={{ left: pct(s.fold * 100), width: pct((1 - s.fold) * 100) }}>
                    <div
                      className={styles.halfImg}
                      style={{ width: pct(100 / (1 - s.fold)), left: pct((-s.fold / (1 - s.fold)) * 100) }}
                    >
                      <Image src={s.src} alt="" fill sizes={sizesFor(s.width)} />
                    </div>
                    <span className={styles.flapShade} data-fold-shade />
                  </div>
                </>
              ) : (
                <Image src={s.src} alt="" fill sizes={sizesFor(s.width)} />
              )}
            </div>
          ))}
          {tx.items.map((item, i) => (
            <span key={item.title} className={styles.cap} data-cap={i} aria-hidden="true">
              <b>
                {i + 1}/{tx.items.length}
              </b>
              {item.title}
            </span>
          ))}
          <span className={styles.sheen} data-sheen aria-hidden="true" />
        </div>
        {done && !still && (
          <button type="button" className={styles.replay} onClick={() => setRun((r) => r + 1)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v4.2h4.2" />
            </svg>
            {tx.replay}
          </button>
        )}
      </div>

      <div className={styles.info}>
        <ol key={run} ref={listRef} className={styles.items} aria-label={tx.itemsAria}>
          {tx.items.map((item, i) => (
            <li key={item.title} className={styles.item}>
              <span className={styles.itemNum} aria-hidden="true">
                {i + 1}
              </span>
              <span>
                <b>{item.title}</b>
                {item.text}
              </span>
            </li>
          ))}
        </ol>

        <div className={styles.order}>
          <p className={styles.price}>
            <span>{tx.priceLabel}</span>
            <b>{price}</b>
          </p>
          <div className={styles.tips} role="group" aria-label={tx.tipsLabel}>
            <span className={styles.tipsLabel}>{tx.tipsLabel}</span>
            <div className={styles.tipList}>
              {KIT_TIPS.map((v) => (
                <button
                  key={v}
                  type="button"
                  className={styles.tipBtn}
                  aria-pressed={tip === v}
                  onClick={() => setTip((cur) => (cur === v ? "" : v))}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <button type="button" className={`btn btn--block ${styles.cta}`} onClick={order}>
            {tx.cta(tip)}
            <ArrowRight className="btn__arrow" />
          </button>
        </div>
      </div>
    </div>
  );
}
