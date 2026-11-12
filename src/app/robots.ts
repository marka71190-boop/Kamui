import type { MetadataRoute } from "next";
import { SITE } from "@/config/site";

export default function robots(): MetadataRoute.Robots {
  return {
    // Справочники доставки (города, пункты выдачи, расчёт) — публичные данные, их можно открывать.
    // Служебные страницы /pay-check, /cdek-orders и проверочная /pay-abroad поисковикам не нужны.
    rules: [{ userAgent: "*", allow: ["/", "/api/delivery/"], disallow: ["/api/", "/pay-check", "/cdek-orders", "/pay-abroad"] }],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.domain,
  };
}
