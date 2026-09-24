import type { StaticImageData } from "next/image";
import chalkBalls from "@/assets/gallery/01-chalk-balls.jpg";
import chalkCloseup from "@/assets/gallery/02-chalk-closeup.jpg";
import chalkInHand from "@/assets/gallery/03-chalk-in-hand.jpg";
import packageDetails from "@/assets/gallery/04-package-details.jpg";

export interface GalleryPhoto {
  src: StaticImageData;
  alt: string;
  caption: string;
}

/** Фотографии коллекции — используются в первом экране и в галерее. */
export const GALLERY: GalleryPhoto[] = [
  {
    src: chalkBalls,
    alt: "Мел Kamui × Iosif Abramov 0.98 β на бильярдном сукне рядом с шарами",
    caption: "Мел с шарами",
  },
  {
    src: chalkCloseup,
    alt: "Кубик мела Kamui × Iosif Abramov крупным планом на зелёном сукне",
    caption: "Мел крупным планом",
  },
  {
    src: chalkInHand,
    alt: "Игрок натирает наклейку кия мелом Kamui × Iosif Abramov",
    caption: "Мел в руке",
  },
  {
    src: packageDetails,
    alt: "Детали упаковки: логотип Kamui, надписи Pyramid и Made in Japan, подпись Иосифа Абрамова",
    caption: "Детали упаковки",
  },
];
