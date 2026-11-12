/**
 * Основные настройки сайта и продукта.
 * Цена и реквизиты продавца меняются здесь.
 */

export const SITE = {
  /** Боевой домен. Можно переопределить переменной окружения NEXT_PUBLIC_SITE_URL. */
  url: (process.env.NEXT_PUBLIC_SITE_URL || "https://kamui-collection.ru").replace(/\/$/, ""),
  domain: "kamui-collection.ru",
  name: "Kamui × Iosif Abramov",
  title: "Kamui × Iosif Abramov — Limited Edition 0.98 β",
  /** Заголовок главной в поиске: по-русски, с ключевыми запросами «мел Kamui / Камуи», «Иосиф Абрамов» */
  seoTitle: "Мел Kamui × Иосиф Абрамов 0.98 β — купить бильярдный мел Камуи",
  description:
    "Лимитированный бильярдный мел Kamui (Камуи) × Иосиф Абрамов 0.98 β для русского бильярда. Всего 2000 экземпляров, 3 500 ₽. Доставка СДЭК по России, оплата онлайн.",
  locale: "ru_RU",
} as const;

export const PRODUCT = {
  name: "Бильярдный мел Kamui × Iosif Abramov — Limited Edition 0.98 β",
  shortName: "Kamui × Iosif Abramov 0.98 β",
  sku: "KAMUI-ABRAMOV-098B",
  brand: "Kamui",
  /** Цена за 1 шт., ₽ */
  price: 3500,
  /**
   * Цена за 1 шт. для заказов из-за рубежа, $ (английская версия и доставка в страны ЕАЭС с оплатой через Robokassa).
   * В неё уже заложена комиссия Robokassa за карты зарубежных банков (9,9%). Переопределить — PRICE_USD.
   */
  priceUsd: 48,
  currency: "RUB",
  /** Максимум штук в одной заявке (от 10 шт. мела — оптовая цена, см. WHOLESALE в products.ts) */
  maxPerOrder: 50,
} as const;

/** Реквизиты продавца (показываются в подвале и в политике конфиденциальности). */
export const SELLER = {
  name: "ИП Абрамова Алина Гургеновна",
  inn: "231715939839",
  ogrnip: "325237500448706",
  legalAddress: "350011, г. Краснодар, улица Обрывная, 132/1",
  actualAddress: "350051, г. Краснодар, улица Шоссе Нефтяников, 40",
  /**
   * Контакты для покупателей — показываются в подвале, оферте, политике и условиях возврата.
   * Телефон можно добавить так: phone: "+7 (900) 000-00-00"
   */
  email: "shop@abramov.shop" as string,
  /** Для английской версии сайта */
  nameEn: "Individual Entrepreneur Abramova Alina Gurgenovna",
  legalAddressEn: "132/1 Obryvnaya St., Krasnodar, 350011, Russia",
  actualAddressEn: "40 Shosse Neftyanikov St., Krasnodar, 350051, Russia",
  phone: "" as string,
} as const;

/** Условия продажи — используются на страницах «Доставка и оплата», «Обмен и возврат» и в оферте. */
export const SHOP = {
  /** Через сколько после оплаты заказ передаётся в СДЭК */
  dispatchTime: "1–3 рабочих дней",
  /** Дата редакции оферты и условий */
  termsEdition: "17 октября 2026 г.",
  /** Дата редакции политики конфиденциальности и текста согласия на обработку данных (пишется в журнал согласий) */
  privacyEdition: "22 октября 2026 г.",
} as const;

/** Как связаться с продавцом — одной строкой для документов. */
export function sellerContactsText(): string {
  const parts = [SELLER.phone && `по телефону ${SELLER.phone}`, SELLER.email && `по электронной почте ${SELLER.email}`].filter(
    Boolean,
  );
  return parts.length ? parts.join(" или ") : `письменно по адресу: ${SELLER.legalAddress}`;
}
