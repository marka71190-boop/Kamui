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
    cityCode?: number;
    pickupPointCode?: string;
    pickupPointAddress?: string;
    tariffCode?: number;
    cost?: number;
    /** UUID заказа в СДЭК */
    orderUuid?: string;
    /** Номер отправления (трек-номер) */
    trackingNumber?: string;
  };
}

/** Оплата через ЮKassa */
export interface OrderPayment {
  provider: "yookassa";
  paymentId?: string;
  status: "pending" | "waiting_for_capture" | "succeeded" | "canceled";
  confirmationUrl?: string;
  paidAt?: string;
}

export interface Order {
  id: string;
  createdAt: string;
  status: OrderStatus;
  region: OrderRegion;
  customer: OrderCustomer;
  address: OrderAddress;
  quantity: number;
  unitPrice: number;
  total: number;
  currency: "RUB";
  comment: string;
  delivery: OrderDelivery;
  payment?: OrderPayment;
  meta?: { ip?: string; userAgent?: string };
}

/** Частичное обновление заказа (статус оплаты, доставка и т.п.) */
export interface OrderPatch {
  status?: OrderStatus;
  delivery?: OrderDelivery;
  payment?: OrderPayment;
}
