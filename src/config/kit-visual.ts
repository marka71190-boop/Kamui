/**
 * Фото подарочного набора и всё для анимации «вещи по очереди ложатся в коробку».
 *
 * Слои в коробке вырезаны из общего снимка (кадр 1200 × 1200); положение — в % от кадра.
 * Для показа «крупно» — отдельные фото каждой вещи (салфетка, конверт с фото, мел, наклейка JOS):
 * сначала вещь видна целиком, потом опускается в коробку и превращается в свой слой.
 */
import box from "@/assets/kit/kit-box.webp";
import front from "@/assets/kit/kit-box-front.webp";
import chalk from "@/assets/kit/kit-chalk.webp";
import cloth from "@/assets/kit/kit-cloth.webp";
import envelope from "@/assets/kit/kit-envelope.webp";
import final from "@/assets/kit/kit-final.jpg";
import showChalk from "@/assets/kit/kit-show-chalk.webp";
import showCloth from "@/assets/kit/kit-show-cloth.webp";
import showEnvelope from "@/assets/kit/kit-show-envelope.webp";
import showTip from "@/assets/kit/kit-show-tip.webp";
import tip from "@/assets/kit/kit-tip.webp";

export const KIT_PHOTO = final;
/** Пустая коробка (основа анимации) */
export const KIT_BOX = box;

export type KitLayerId = "cloth" | "envelope" | "chalk" | "tip";

type Rect = { left: number; top: number; width: number; height: number };

/** Слои в порядке, в котором вещи ложатся в коробку */
export const KIT_LAYERS: ({ id: KitLayerId; src: typeof box } & Rect)[] = [
  { id: "cloth", src: cloth, left: 24.481, top: 50.546, width: 58.197, height: 35.355 },
  { id: "envelope", src: envelope, left: 26.339, top: 24.918, width: 37.486, height: 38.251 },
  { id: "chalk", src: chalk, left: 49.344, top: 50.546, width: 33.443, height: 27.322 },
  { id: "tip", src: tip, left: 66.284, top: 57.978, width: 18.415, height: 16.885 },
];

/**
 * Передняя и левая стенки коробки (та же картинка, что и основа, только стенки).
 * Лежат поверх вещи, пока она опускается внутрь, — край коробки закрывает её низ, как в жизни.
 */
export const KIT_FRONT: { src: typeof box } & Rect = { src: front, left: 12.417, top: 59.583, width: 80.25, height: 40.417 };

/** Куда вещь ложится: преобразование рамки показа в место в коробке (совпадает со слоем) */
export type KitLand = {
  /** сдвиг, % от своей ширины и высоты */
  x: number;
  y: number;
  /** поворот и наклон, градусы */
  rot: number;
  skew: number;
  /** масштаб по ширине и высоте */
  sx: number;
  sy: number;
};

export type KitShow = { id: KitLayerId; src: typeof box; land: KitLand; lift: number; fold?: number } & Rect;

/**
 * Вещи «крупным планом»: рамка показа в % кадра, место в коробке (land),
 * на сколько % кадра выше места вещь зависает, прежде чем опуститься (lift),
 * у салфетки — какая доля ширины остаётся видна после сгиба (fold).
 * Числа посчитаны по фото: вещь точно ложится на свой слой в коробке.
 */
export const KIT_SHOW: KitShow[] = [
  {
    id: "cloth",
    src: showCloth,
    left: 8.333,
    top: 25.234,
    width: 83.333,
    height: 40.365,
    land: { x: 11.73, y: 94.18, rot: -15.52, skew: 16.64, sx: 0.8565, sy: 0.6998 },
    lift: 11,
    fold: 0.7223,
  },
  {
    id: "envelope",
    src: showEnvelope,
    left: 18.427,
    top: 10.417,
    width: 63.146,
    height: 70,
    land: { x: 4.88, y: 29.46, rot: -17.36, skew: 0.16, sx: 0.5483, sy: 0.485 },
    lift: 7,
  },
  {
    id: "chalk",
    src: showChalk,
    left: 25,
    top: 18.542,
    width: 50,
    height: 53.75,
    land: { x: 47.25, y: 73.01, rot: -19.89, skew: 11.51, sx: 0.4689, sy: 0.4304 },
    lift: 9,
  },
  {
    id: "tip",
    src: showTip,
    left: 37.5,
    top: 31.917,
    width: 25,
    height: 27,
    land: { x: 140.26, y: 123.59, rot: -17, skew: 0, sx: 0.2155, sy: 0.2083 },
    lift: 7,
  },
];

/** Событие «выбрать подарочный набор» — из блока набора в форму заказа (detail: { tip?: string }) */
export const KIT_EVENT = "kamui:choose-kit";
