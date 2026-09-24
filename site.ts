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
  description:
    "Лимитированная серия бильярдного мела Kamui × Iosif Abramov 0.98 β. Всего 2000 экземпляров: японские технологии Kamui и опыт одного из сильнейших игроков современного бильярда.",
  locale: "ru_RU",
} as const;

export const PRODUCT = {
  name: "Бильярдный мел Kamui × Iosif Abramov — Limited Edition 0.98 β",
  shortName: "Kamui × Iosif Abramov 0.98 β",
  sku: "KAMUI-ABRAMOV-098B",
  brand: "Kamui",
  /** Цена за 1 шт., ₽ */
  price: 3500,
  currency: "RUB",
  /** Максимум штук в одной заявке */
  maxPerOrder: 10,
} as const;

/** Реквизиты продавца (показываются в подвале и в политике конфиденциальности). */
export const SELLER = {
  name: "ИП Абрамова Алина Гургеновна",
  inn: "231715939839",
  ogrnip: "325237500448706",
  // TODO: при желании добавьте город и индекс — для реквизитов это рекомендуется.
  legalAddress: "улица Обрывная, 132/1",
  actualAddress: "улица Шоссе нефтяников, 40",
  /**
   * Контакты для покупателей — впишите, и они появятся в подвале и в политике конфиденциальности.
   * Пример: email: "hello@kamui-collection.ru", phone: "+7 (900) 000-00-00"
   */
  email: "" as string,
  phone: "" as string,
} as const;
