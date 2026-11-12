import type { StaticImageData } from "next/image";
import chalkAndPouch from "@/assets/gallery/00-chalk-and-pouch.jpg";
import chalkBalls from "@/assets/gallery/01-chalk-balls.jpg";
import chalkCloseup from "@/assets/gallery/02-chalk-closeup.jpg";
import chalkInHand from "@/assets/gallery/03-chalk-in-hand.jpg";
import packageDetails from "@/assets/gallery/04-package-details.jpg";

export interface GalleryPhoto {
  src: StaticImageData;
  alt: string;
  caption: string;
  /** Английская версия сайта */
  altEn?: string;
  captionEn?: string;
  /** Что оставить в кадре при обрезке (CSS object-position), например «40% 30%» */
  position?: string;
}

/** Фотографии коллекции — используются в первом экране и в галерее. */
export const GALLERY: GalleryPhoto[] = [
  {
    src: chalkAndPouch,
    alt: "Мел Kamui × Иосиф Абрамов 0.98 β и фирменная упаковка с подписью Иосифа Абрамова на зелёном сукне",
    caption: "Мел и упаковка",
    altEn: "Kamui × Iosif Abramov 0.98 β chalk and its signed pouch on green cloth",
    captionEn: "Chalk and pouch",
    position: "42% 30%",
  },
  {
    src: chalkBalls,
    alt: "Бильярдный мел Kamui × Иосиф Абрамов 0.98 β на сукне рядом с шарами",
    caption: "Мел с шарами",
    altEn: "Kamui × Iosif Abramov 0.98 β chalk on billiard cloth next to the balls",
    captionEn: "Chalk and balls",
  },
  {
    src: chalkCloseup,
    alt: "Кубик мела Камуи (Kamui) × Иосиф Абрамов крупным планом на зелёном сукне",
    caption: "Мел крупным планом",
    altEn: "Close-up of a Kamui × Iosif Abramov chalk cube on green cloth",
    captionEn: "Chalk close-up",
  },
  {
    src: chalkInHand,
    alt: "Игрок натирает наклейку кия мелом Kamui × Иосиф Абрамов",
    caption: "Мел в руке",
    altEn: "A player chalking the cue tip with Kamui × Iosif Abramov chalk",
    captionEn: "Chalk in hand",
  },
  {
    src: packageDetails,
    alt: "Детали упаковки: логотип Kamui, надписи Pyramid и Made in Japan, подпись Иосифа Абрамова",
    caption: "Детали упаковки",
    altEn: "Packaging details: Kamui logo, Pyramid and Made in Japan marks, Iosif Abramov signature",
    captionEn: "Packaging details",
  },
];

/** Подписи фотографий на нужном языке */
export function galleryFor(lang: "ru" | "en"): GalleryPhoto[] {
  return lang === "en"
    ? GALLERY.map((p) => ({ ...p, alt: p.altEn ?? p.alt, caption: p.captionEn ?? p.caption }))
    : GALLERY;
}
