/**
 * Анимация подарочного набора (Web Animations API).
 *
 * Каждая вещь по очереди:
 *  1) появляется крупно над коробкой (коробка чуть затемнена, внизу — подпись «1/4 · Салфетка…»);
 *  2) салфетка ещё и складывается пополам — видимой остаётся сторона с вышивкой;
 *  3) поднимается над своим местом, уменьшаясь и поворачиваясь как в коробке;
 *  4) опускается внутрь — передняя стенка закрывает её низ — и превращается в свой слой в коробке;
 *  5) в списке состава загорается её пункт.
 * В конце по набору проходит блик.
 *
 * Все времена — в секундах от старта. Если браузер не умеет element.animate или включено
 * «уменьшение движения», анимации нет: сразу виден собранный набор (см. Kit.module.css).
 */
import type { KitLand, KitShow } from "@/config/kit-visual";

/** Длительности этапов, с */
export const KIT_T = {
  start: 0.35,
  appear: 0.42,
  hold: 0.45,
  fold: 0.6,
  lift: 0.55,
  drop: 0.32,
  fade: 0.28,
  /** пауза после касания дна, прежде чем покажется следующая вещь */
  gap: 0.1,
  sheen: 1.3,
};

export type KitPhase = {
  begin: number;
  shown: number;
  /** конец показа (у салфетки — после сгиба) */
  still: number;
  /** когда начинается сгиб (только салфетка) */
  foldAt: number;
  hover: number;
  land: number;
  end: number;
};

export function kitTimeline(items: Pick<KitShow, "fold">[]) {
  const phases: KitPhase[] = [];
  let t = KIT_T.start;
  for (const it of items) {
    const begin = t;
    const shown = begin + KIT_T.appear;
    const foldAt = shown + KIT_T.hold;
    const still = it.fold ? foldAt + KIT_T.fold : foldAt;
    const hover = still + KIT_T.lift;
    const land = hover + KIT_T.drop;
    const end = land + KIT_T.fade + 0.06;
    phases.push({ begin, shown, still, foldAt, hover, land, end });
    t = land + KIT_T.gap;
  }
  const last = phases[phases.length - 1];
  return { phases, sheenAt: last.end, total: last.end + KIT_T.sheen };
}

const r = (n: number) => Math.round(n * 1000) / 1000;

/** Одна и та же форма преобразования во всех кадрах — браузер плавно меняет каждое число */
const tf = (x: number, y: number, rot = 0, skew = 0, sx = 1, sy = sx) =>
  `translate(${r(x)}%, ${r(y)}%) rotate(${r(rot)}deg) skewX(${r(skew)}deg) scale(${r(sx)}, ${r(sy)})`;

const landTf = (l: KitLand, dy = 0) => tf(l.x, l.y + dy, l.rot, l.skew, l.sx, l.sy);

const EASE_OUT = "cubic-bezier(0.2, 0.8, 0.25, 1)";
const EASE_IN_OUT = "cubic-bezier(0.45, 0, 0.25, 1)";
/** падение — с разгоном */
const EASE_DROP = "cubic-bezier(0.5, 0, 0.9, 0.55)";

type Frame = Keyframe & { offset: number };

/** Ключевые кадры по абсолютному времени → смещения 0…1 внутри [from, to] */
function frames(from: number, to: number, list: (Omit<Frame, "offset"> & { at: number })[]): Frame[] {
  const span = to - from;
  return list.map(({ at, ...k }) => ({ ...k, offset: Math.min(1, Math.max(0, (at - from) / span)) }));
}

function run(el: Element | null | undefined, from: number, to: number, kf: Frame[], out: Animation[]) {
  if (!el) return;
  out.push(el.animate(kf, { delay: from * 1000, duration: (to - from) * 1000, fill: "both" }));
}

/**
 * Запускает анимацию. stage — сцена (внутри [data-show], [data-layer], [data-cap], [data-dim], [data-sheen]),
 * list — список состава (его пункты по порядку). Возвращает запущенные анимации (для отмены).
 */
export function playKit(stage: HTMLElement, list: HTMLElement | null, items: KitShow[]): Animation[] {
  const { phases, sheenAt } = kitTimeline(items);
  const out: Animation[] = [];
  const q = (sel: string) => stage.querySelector<HTMLElement>(sel);

  items.forEach((it, i) => {
    const p = phases[i];
    const L = it.land;
    /** подъём над местом — в % своей высоты */
    const liftY = (it.lift / it.height) * 100;
    /** при касании дна вещь чуть «проседает» (на 0,35 % кадра) и выпрямляется */
    const sinkY = (0.35 / it.height) * 100;

    run(
      q(`[data-show="${it.id}"]`),
      p.begin,
      p.end,
      frames(p.begin, p.end, [
        { at: p.begin, opacity: 0, transform: tf(4, 7, 0, 0, 0.92), zIndex: 6, easing: EASE_OUT },
        { at: p.shown, opacity: 1, transform: tf(0, 0), zIndex: 6, easing: "ease-in-out" },
        { at: p.still, opacity: 1, transform: tf(0, -1.2), zIndex: 6, easing: EASE_IN_OUT },
        { at: p.hover, opacity: 1, transform: landTf(L, -liftY), zIndex: 6 },
        // над коробкой: дальше вещь идёт под переднюю стенку
        { at: p.hover + 0.001, opacity: 1, transform: landTf(L, -liftY), zIndex: 2, easing: EASE_DROP },
        { at: p.land - 0.07, opacity: 1, transform: landTf(L, sinkY), zIndex: 2, easing: "ease-out" },
        { at: p.land + 0.04, opacity: 1, transform: landTf(L), zIndex: 2, easing: "linear" },
        { at: p.end, opacity: 0, transform: landTf(L), zIndex: 2 },
      ]),
      out,
    );

    // салфетка складывается: правая часть уходит назад
    if (it.fold) {
      run(
        q(`[data-show="${it.id}"] [data-fold]`),
        p.foldAt,
        p.still,
        [
          { offset: 0, transform: "perspective(1600px) rotateY(0deg)", easing: "cubic-bezier(0.55, 0, 0.35, 1)" },
          { offset: 1, transform: "perspective(1600px) rotateY(180deg)" },
        ],
        out,
      );
      run(
        q(`[data-show="${it.id}"] [data-fold-shade]`),
        p.foldAt,
        p.still,
        [
          { offset: 0, opacity: 0 },
          { offset: 0.5, opacity: 0.6 },
          { offset: 1, opacity: 0.6 },
        ],
        out,
      );
    }

    // слой в коробке проявляется под вещью в момент касания
    run(
      q(`[data-layer="${it.id}"]`),
      p.land - 0.08,
      p.land + 0.06,
      [
        { offset: 0, opacity: 0 },
        { offset: 1, opacity: 1 },
      ],
      out,
    );

    // подпись
    run(
      q(`[data-cap="${i}"]`),
      p.begin,
      p.still + 0.2,
      frames(p.begin, p.still + 0.2, [
        { at: p.begin, opacity: 0, transform: "translateY(8px)" },
        { at: p.begin + 0.12, opacity: 0, transform: "translateY(8px)", easing: EASE_OUT },
        { at: p.shown + 0.05, opacity: 1, transform: "translateY(0)" },
        { at: p.still, opacity: 1, transform: "translateY(0)", easing: "ease-in" },
        { at: p.still + 0.2, opacity: 0, transform: "translateY(0)" },
      ]),
      out,
    );

    // пункт в списке состава
    const li = list?.children[i];
    run(
      li,
      p.land,
      p.land + 0.45,
      [
        { offset: 0, opacity: 0.38 },
        { offset: 1, opacity: 1 },
      ],
      out,
    );
  });

  // затемнение коробки, пока вещь показана крупно
  const dimFrames: (Omit<Frame, "offset"> & { at: number })[] = [{ at: 0, opacity: 0 }];
  phases.forEach((p) => {
    dimFrames.push(
      { at: p.begin, opacity: 0, easing: EASE_OUT },
      { at: p.shown, opacity: 1 },
      { at: p.still, opacity: 1, easing: "ease-in-out" },
      { at: p.hover - 0.1, opacity: 0 },
    );
  });
  const lastHover = phases[phases.length - 1].hover;
  run(q("[data-dim]"), 0, lastHover, frames(0, lastHover, dimFrames), out);

  // блик по собранному набору
  run(
    q("[data-sheen]"),
    sheenAt,
    sheenAt + KIT_T.sheen,
    [
      { offset: 0, opacity: 0, transform: "translateX(0) skewX(-18deg)", easing: "ease-in-out" },
      { offset: 0.2, opacity: 1 },
      { offset: 0.8, opacity: 1 },
      { offset: 1, opacity: 0, transform: "translateX(560%) skewX(-18deg)" },
    ],
    out,
  );

  return out;
}

/** Ждём, пока загрузятся картинки сцены (не дольше ms) */
export function whenImagesReady(root: HTMLElement, ms: number): Promise<void> {
  const imgs = Array.from(root.querySelectorAll("img"));
  const ready = Promise.all(
    imgs.map((img) =>
      img.complete && img.naturalWidth > 0
        ? Promise.resolve()
        : new Promise<void>((res) => {
            img.addEventListener("load", () => res(), { once: true });
            img.addEventListener("error", () => res(), { once: true });
          }),
    ),
  ).then(() => undefined);
  return Promise.race([ready, new Promise<void>((res) => setTimeout(res, ms))]);
}
