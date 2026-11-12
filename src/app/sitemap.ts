import type { MetadataRoute } from "next";
import { GALLERY } from "@/config/gallery";
import { SITE } from "@/config/site";

/** Карта сайта для Яндекса и Google: главная на двух языках с фотографиями товара, документы. */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const languages = { ru: `${SITE.url}/`, en: `${SITE.url}/en` };
  const images = GALLERY.map((p) => new URL(p.src.src, SITE.url).toString());
  return [
    { url: `${SITE.url}/`, lastModified: now, changeFrequency: "daily", priority: 1, alternates: { languages }, images },
    { url: `${SITE.url}/en`, lastModified: now, changeFrequency: "daily", priority: 0.8, alternates: { languages }, images },
    { url: `${SITE.url}/delivery`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE.url}/returns`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE.url}/oferta`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE.url}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE.url}/consent`, lastModified: now, changeFrequency: "yearly", priority: 0.1 },
  ];
}
