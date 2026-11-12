/**
 * Таблицы базы. Создаются сами при первом обращении (CREATE … IF NOT EXISTS) — ничего запускать вручную не нужно.
 *
 *   orders        — заказы: всё о заказе (data), данные для накладной СДЭК (ship), отметки о письмах покупателю
 *   order_events  — история заказа: оплата, накладная, письма, ошибки
 *   consents      — журнал согласий из формы заказа (кто, когда, с какого IP и на что согласился)
 *   order_flags   — пометки продавца: заказ скрыт со страницы, номер накладной, оформленной вручную в СДЭК,
 *                   когда сборщик собрал заказ
 *   stock_batches — склад: поступления товара партиями (страница /sales)
 *   settings      — служебные отметки (например, когда перенесены старые заказы)
 */
import { dbConfigured, sqlExec } from "./pg";

const SCHEMA = `
create table if not exists orders (
  id text primary key,
  created_at timestamptz not null,
  updated_at timestamptz not null default now(),
  status text not null,
  region text not null default 'ru',
  name text not null default '',
  phone text not null default '',
  email text not null default '',
  total numeric not null default 0,
  data jsonb not null,
  ship jsonb,
  payment_provider text,
  payment_id text,
  rk_invoice text,
  paid_at timestamptz,
  tracking text,
  mail_marks text not null default '',
  source text not null default 'site'
);
create index if not exists orders_created_idx on orders (created_at desc);
create index if not exists orders_status_idx on orders (status);
create index if not exists orders_rk_idx on orders (rk_invoice) where rk_invoice is not null;
create table if not exists order_events (
  id bigserial primary key,
  order_id text not null,
  at timestamptz not null default now(),
  kind text not null,
  text text not null default ''
);
create index if not exists order_events_order_idx on order_events (order_id, at);
create table if not exists consents (
  id bigserial primary key,
  order_id text not null,
  created_at timestamptz not null,
  data jsonb not null
);
create index if not exists consents_order_idx on consents (order_id);
create table if not exists order_flags (
  order_id text primary key,
  hidden boolean not null default false,
  manual_tracking text,
  updated_at timestamptz not null default now()
);
alter table order_flags add column if not exists packed_at timestamptz;
create table if not exists stock_batches (
  id bigserial primary key,
  received_on date not null,
  qty integer not null,
  note text not null default '',
  created_at timestamptz not null default now()
);
create table if not exists settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
`;

let ready: Promise<void> | null = null;

export const dbEnabled = dbConfigured;

/** Таблицы на месте (один раз за работу сервера; при ошибке — попробуем снова в следующий раз) */
export function ensureSchema(): Promise<void> {
  ready ??= sqlExec(SCHEMA).catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}
