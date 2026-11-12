/**
 * Модель заказа. Уже содержит поля под будущую оплату (ЮKassa) и доставку (СДЭК),
 * чтобы подключение интеграций не требовало менять формат данных.
 */

export type OrderRegion = "ru" | "intl";

export type OrderStatus =
  | "new" // заявка принята, ждёт звонка менеджера
  | "awaiting_payment" // создан платёж, ждём оплату (ЮKassa)
  | "paid" // оплачено
  | "payment_canceled" // платёж отменён / не прошёл
  | "shipped" // передан в доставку
  | "delivered" // получен покупателем
  | "cancelled"; // заказ отменён

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  new: "Новая",
  awaiting_payment: "Ожидает оплаты",
  paid: "Оплачена",
  payment_canceled: "Оплата отменена",
  shipped: "Отправлена",
  delivered: "Доставлена",
  cancelled: "Отменена",
};

export interface OrderCustomer {
  /** ИИН (Казахстан) / ПИН (Кыргызстан) получателя — для накладной СДЭК */
  taxId?: string;
  name: string;
  phone: string;
  email: string;
}

export interface OrderAddress {
  country: string;
  city: string;
  /** Только для международных заказов */
  postalCode?: string;
  address?: string;
}

/** Доставка. Для СДЭК заполняются ПВЗ, стоимость и номер отправления. */
export interface OrderDelivery {
  provider: "cdek" | "international" | "manual";
  /** Человекочитаемое описание для таблицы */
  label: string;
  cdek?: {
    /** Страна пункта выдачи (RU, BY, KZ, AM, KG) */
    countryCode?: string;
    cityCode?: number;
    cityName?: string;
    pickupPointCode?: string;
    pickupPointAddress?: string;
    tariffCode?: number;
    /** Стоимость по тарифу СДЭК вместе со страховкой, ₽ (сколько платит магазин) */
    cost?: number;
    /** Из неё страховка объявленной стоимости, ₽ */
    insurance?: number;
    /** Сколько платит покупатель за доставку, ₽ (тариф + наценка, 0 — бесплатно) */
    price?: number;
    periodMin?: number;
    periodMax?: number;
    /** Заказ из-за рубежа: цены в долларах (мел, доставка) и курс ЦБ, по которому считались рубли */
    abroad?: { unitUsd: number; deliveryUsd: number; rate: number; kit?: boolean; wholesale?: boolean };
    /** UUID заказа в СДЭК */
    orderUuid?: string;
    /** Номер отправления (трек-номер) */
    trackingNumber?: string;
  };
}

/** Оплата: ЮKassa (Россия) или Robokassa (доставка за пределы России) */
export interface OrderPayment {
  provider: "yookassa" | "robokassa";
  /** Готовый текст для колонки «Платёж» (Robokassa) */
  label?: string;
  paymentId?: string;
  status: "pending" | "waiting_for_capture" | "succeeded" | "canceled";
  confirmationUrl?: string;
  paidAt?: string;
  /** Платёж тестового магазина ЮKassa (деньги не списываются) */
  test?: boolean;
}

export interface Order {
  id: string;
  createdAt: string;
  status: OrderStatus;
  region: OrderRegion;
  customer: OrderCustomer;
  address: OrderAddress;
  /** Подарочный набор (у мела не заполнено) */
  product?: "kit";
  /** Наклейка JOS в наборе: M, H, H+, PM, PH, PRO */
  tip?: string;
  /** Количество: мелов или наборов (в каждом наборе — один мел из тиража) */
  quantity: number;
  /** Покупатель согласился получать письма о заказе (подтверждение оплаты, трек-номер) */
  newsletter?: true;
  unitPrice: number;
  /** Стоимость товаров, ₽ */
  itemsTotal: number;
  /** Доставка, которую платит покупатель, ₽ (0 — бесплатно или уточняется) */
  deliveryCost: number;
  /** К оплате: товары + доставка, ₽ */
  total: number;
  currency: "RUB";
  comment: string;
  delivery: OrderDelivery;
  payment?: OrderPayment;
  meta?: { ip?: string; userAgent?: string };
  /** Какие согласия покупатель дал в форме (для журнала согласий в таблице) */
  consents?: OrderConsents;
}

/** Частичное обновление заказа (статус оплаты, доставка и т.п.) */
export interface OrderPatch {
  status?: OrderStatus;
  delivery?: OrderDelivery;
  payment?: OrderPayment;
  /** Отметка об отправленном покупателю письме: «оплата 23.10.2026 14:30», «трек 1234567890 …» (дописывается в таблицу) */
  mailNote?: string;
}

/** Согласия из формы заказа: на обработку персональных данных (обязательное) и на письма о заказе (по желанию) */
export interface OrderConsents {
  personalData: boolean;
  orderEmails: boolean;
  /** Редакция текста согласия и политики конфиденциальности */
  edition: string;
}
