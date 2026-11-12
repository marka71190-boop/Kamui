import { KIT, WHOLESALE } from "@/config/products";
import { PRODUCT } from "@/config/site";
import type { Currency } from "@/lib/format";
import type { Lang } from "./lang";

/** Версия сайта: язык, валюта цен и префикс адресов («» — русская, «/en» — английская). */
export interface Market {
  lang: Lang;
  currency: Currency;
  /** Цена 1 шт. в валюте версии */
  unitPrice: number;
  /** Цена подарочного набора в валюте версии */
  kitPrice: number;
  /** Оптовая цена мела (от WHOLESALE.minQty шт.) в валюте версии */
  wholesalePrice: number;
  /** Префикс ссылок на разделы главной: «/» или «/en» */
  home: string;
}

export const RU_MARKET: Market = {
  lang: "ru",
  currency: "RUB",
  unitPrice: PRODUCT.price,
  kitPrice: KIT.price,
  wholesalePrice: WHOLESALE.price,
  home: "/",
};

export const enMarket = (unitUsd: number, kitUsd: number = KIT.priceUsd, wholesaleUsd: number = WHOLESALE.priceUsd): Market => ({
  lang: "en",
  currency: "USD",
  unitPrice: unitUsd,
  kitPrice: kitUsd,
  wholesalePrice: wholesaleUsd,
  home: "/en",
});
