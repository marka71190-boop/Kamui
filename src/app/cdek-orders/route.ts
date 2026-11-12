/**
 * /cdek-orders?token=<PAYMENTS_TEST_TOKEN> — служебная страница для продавца:
 * оплаченные заказы сайта и их накладные СДЭК.
 *
 * Если у оплаченного заказа нет накладной (сервер перезапустился в момент оплаты, СДЭК был недоступен
 * или не принял данные) — кнопка «Создать накладную». Если СДЭК отказал, видна причина.
 * Кнопка «Записать трек-номера в таблицу» дописывает номера СДЭК в колонку «Доставка» — и тем заказам,
 * у которых номер появился позже, чем сайт его ждал.
 * Письма покупателям (оплата, трек-номер, срок хранения) отправляет сам сайт — src/lib/mail; здесь видно, какие ушли,
 * и есть кнопка «Проверить и отправить письма покупателям».
 * Кроме оплат ЮKassa показываются оплаченные заказы из таблицы с пунктом выдачи СДЭК — в том числе заказы
 * из-за рубежа (Robokassa), заказы, ждущие оплаты в Robokassa (при открытии страницы сайт сверяет их
 * с Robokassa — вдруг уведомление об оплате не дошло), и лист «Международные заказы».
 * Для этого нужен скрипт таблицы с действием paidOrders (apps-script.gs).
 * Без правильного токена отвечает 404. В поиск не попадает.
 */
import { features } from "@/config/features";
import { AT_PICKUP_CODES, CdekOrderRejected, getTrackingNumber } from "@/lib/delivery/cdek";
import { shipRobokassaOrder } from "@/lib/delivery/auto-ship";
import { shipPaidOrder, type ShipResult } from "@/lib/delivery/ship";
import { getUsdRate } from "@/lib/currency";
import { mailOrderFrom, runMailJobs, storageUntil } from "@/lib/mail/jobs";
import { intlPaymentDetails, mailEnabled, notifyIntlPay, notifyStorage } from "@/lib/mail/notify";
import { mailFrom, mailStatus } from "@/lib/mail/transport";
import { updateOrderStrict } from "@/lib/orders/store";
import { importedAt, importOldOrders, type ImportReport } from "@/lib/db/import";
import { dbTlsUnverified, sql } from "@/lib/db/pg";
import { dbEnabled } from "@/lib/db/schema";
import { orderEvents, ordersOverview } from "@/lib/orders/repo";
import { orderFlags, setHidden, setManualTracking, setPacked, shipmentFor, type OrderFlags } from "@/lib/orders/flags";
import { logOrderEvent } from "@/lib/orders/stores/postgres";
import { checkRobokassaInvoice } from "@/lib/payments/robokassa-check";
import { reconcileYooKassa, type YooKassaReconcile } from "@/lib/payments/yookassa-reconcile";
import { getSetting } from "@/lib/db/settings";
import { SITE } from "@/config/site";
import { notifyTrack } from "@/lib/mail/notify";
import { robokassaInvoiceFrom, type SheetPaidOrder } from "@/lib/orders/stores/google-sheets";
import { reconcileRobokassa, type ReconcileReport } from "@/lib/payments/robokassa-reconcile";
import { listPaidSiteOrders, type YooKassaPayment } from "@/lib/payments/yookassa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
};

const notFound = () => new Response("Not found", { status: 404, headers: { "X-Robots-Tag": "noindex" } });

function authorized(given: string | null | undefined): boolean {
  const token = process.env.PAYMENTS_TEST_TOKEN ?? "";
  return token.length >= 8 && given === token;
}

type CdekState =
  | { kind: "ok"; number: string | null; status?: string; statusCode?: string; arrivedAt?: string; keepFreeUntil?: string }
  | { kind: "none" }
  | { kind: "rejected"; reason: string }
  | { kind: "error"; reason: string };

/** Пометки продавца (скрыт, накладная вручную) — загружаются при каждом показе страницы */
let FLAGS = new Map<string, OrderFlags>();

async function cdekState(orderId: string): Promise<CdekState> {
  try {
    const s = await shipmentFor(orderId, FLAGS.get(orderId)?.manualTracking ?? null);
    if (!s) return { kind: "none" };
    const extra = { status: s.status, statusCode: s.statusCode, arrivedAt: s.arrivedAt, keepFreeUntil: s.keepFreeUntil };
    if (s.trackingNumber) return { kind: "ok", number: s.trackingNumber, ...extra };
    try {
      return { kind: "ok", number: await getTrackingNumber(s.uuid), ...extra };
    } catch (err) {
      if (err instanceof CdekOrderRejected) return { kind: "rejected", reason: err.message };
      throw err;
    }
  } catch (err) {
    return { kind: "error", reason: String((err as Error).message).slice(0, 200) };
  }
}

/** Проверяем накладные небольшими пачками, чтобы не упереться в лимиты СДЭК */
async function statesFor(payments: Item[]): Promise<CdekState[]> {
  const out: CdekState[] = [];
  for (let i = 0; i < payments.length; i += 6) {
    out.push(...(await Promise.all(payments.slice(i, i + 6).map((p) => cdekState(p.metadata?.orderId ?? "")))));
  }
  return out;
}

/** Заказ на странице: платёж ЮKassa или (fromSheet) оплаченный заказ из таблицы — например, из-за рубежа через Robokassa */
type Item = YooKassaPayment & {
  fromSheet?: boolean;
  place?: string;
  /** отметки о письмах покупателю из таблицы */
  marks?: string;
  /** колонка «Платёж» (номер счёта Robokassa) */
  payment?: string;
  /** колонка «Доставка», если там ошибка («⚠ отправление не создано автоматически — …») */
  sheetNote?: string;
};

/** Строка таблицы → тот же вид, что у платежа ЮKassa (данные для карточки — в metadata) */
function sheetItem(o: SheetPaidOrder): Item | null {
  const pvz = /^СДЭК ПВЗ\s+([A-Za-z0-9_-]+)/.exec(o.delivery)?.[1];
  if (!pvz || !o.id) return null;
  const kit = /^Подарочный набор/.test(o.comment) ? /наклейка JOS\s+(\S+)/.exec(o.comment)?.[1] : undefined;
  return {
    id: `sheet-${o.id}`,
    status: "succeeded",
    paid: true,
    amount: { value: String(o.total), currency: "RUB" },
    created_at: o.createdAt || new Date().toISOString(),
    metadata: {
      orderId: o.id,
      pvz,
      name: o.name,
      phone: o.phone,
      email: o.email,
      qty: String(o.quantity),
      delivery: o.delivery.replace(/ · трек \d+.*$/, ""),
      ...(kit ? { kit } : {}),
    },
    fromSheet: true,
    place: o.city,
    marks: o.mailMarks,
    payment: o.payment,
  };
}

interface Loaded {
  items: Item[];
  note?: string;
  /** Ждут оплаты в Robokassa (null — скрипт таблицы старый) */
  awaiting: SheetPaidOrder[] | null;
  /** Лист «Международные заказы» (null — скрипт таблицы старый) */
  intl: SheetPaidOrder[] | null;
}

/** Оплаты ЮKassa + оплаченные заказы из таблицы, которых нет в ЮKassa (Robokassa, ручные), — новые сверху */
async function loadItems(days: number): Promise<Loaded> {
  const [yk, sheet] = await Promise.allSettled([listPaidSiteOrders(days), ordersOverview(days)]);
  if (yk.status === "rejected") throw yk.reason;
  const items: Item[] = [...yk.value];
  let note: string | undefined;
  let awaiting: SheetPaidOrder[] | null = null;
  let intl: SheetPaidOrder[] | null = null;
  if (sheet.status === "rejected") note = `Заказы из ${dbEnabled() ? "базы" : "таблицы"} не загрузились: ${String((sheet.reason as Error)?.message ?? sheet.reason).slice(0, 160)}`;
  else if (sheet.value === null)
    note = "Заказы из-за рубежа (Robokassa) здесь не видны: обновите основной скрипт таблицы и разверните новую версию.";
  else {
    ({ awaiting, intl } = sheet.value);
    if (awaiting === null || intl === null)
      note = "Международные заказы и заказы, ждущие оплаты в Robokassa, здесь не видны: обновите основной скрипт таблицы и разверните новую версию.";
    const paid = sheet.value.paid;
    const known = new Set(items.map((p) => p.metadata?.orderId));
    const byId = new Map(paid.map((o) => [o.id, o]));
    for (const p of items) {
      const o = byId.get(p.metadata?.orderId ?? "");
      p.marks = o?.mailMarks;
      if (o && /⚠/.test(o.delivery)) p.sheetNote = o.delivery;
    }
    for (const o of paid) {
      if (known.has(o.id)) continue;
      const it = sheetItem(o);
      if (it) items.push(it);
    }
  }
  items.sort((a, b) => String(b.captured_at ?? b.created_at).localeCompare(String(a.captured_at ?? a.created_at)));
  return { items, note, awaiting, intl };
}

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const when = (p: YooKassaPayment) =>
  new Date(p.captured_at ?? p.created_at).toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const rub = (v: string) => `${Math.round(Number(v)).toLocaleString("ru-RU")} ₽`;

function button(token: string, orderId: string, label: string) {
  return `<form method="post"><input type="hidden" name="token" value="${esc(token)}"><input type="hidden" name="order" value="${esc(orderId)}"><button type="submit">${esc(label)}</button></form>`;
}

/**
 * Посылка ещё не передана в СДЭК: накладной нет, СДЭК её отклонил или она только оформлена
 * (статус «Создан» / «Принят» — СДЭК ещё не получил посылку на складе).
 */
function notShipped(p: Item, s: CdekState): boolean {
  if (!p.metadata?.pvz) return false;
  if (s.kind === "none" || s.kind === "rejected") return true;
  if (s.kind !== "ok") return false;
  if (s.statusCode) return s.statusCode === "CREATED" || s.statusCode === "ACCEPTED";
  return !s.status || /^(создан|принят)$/i.test(s.status.trim());
}

const kindIcon: Record<string, string> = { created: "•", paid: "₽", ship: "✓", ship_error: "⚠", mail: "✉", mail_error: "✕", status: "→", pack: "☑" };

/** Галочка сборщика: «Собрал» — заказ упакован и готов к отправке */
function packButton(token: string, orderId: string, packedAt: string | null): string {
  if (!dbEnabled()) return "";
  // после нажатия страница возвращается к этому же заказу
  return packedAt
    ? `<form method="post" action="#${esc(orderId)}" class="pack">${hidden(token, { action: "unpack", order: orderId })}<button type="submit" class="packbtn on" title="Снять отметку">☑ Собран · ${esc(dateOf(packedAt))}</button></form>`
    : `<form method="post" action="#${esc(orderId)}" class="pack">${hidden(token, { action: "pack", order: orderId })}<button type="submit" class="packbtn">☐ Собрал</button></form>`;
}

/** История заказа из базы */
function historyBlock(events?: { at: string; kind: string; text: string }[]): string {
  if (!events?.length) return "";
  return `<details class="hist"><summary>История · ${events.length}</summary><ul>${events
    .map((e) => `<li><span>${esc(dateOf(e.at))}</span> ${esc(kindIcon[e.kind] ?? "•")} ${esc(e.text)}</li>`)
    .join("")}</ul></details>`;
}

let HISTORY = new Map<string, { at: string; kind: string; text: string }[]>();

function card(p: Item, s: CdekState, token: string, waiting = false): string {
  const m = p.metadata ?? {};
  const id = m.orderId ?? "";
  let cdek: string;
  let cls: string;
  if (!m.pvz) {
    cls = "warn";
    cdek = "Заказ без пункта выдачи СДЭК — отправку оформляет менеджер";
  } else if (s.kind === "ok") {
    cls = "ok";
    cdek = `✓ Накладная СДЭК${s.number ? ` № ${esc(s.number)}` : " создана, номер ещё присваивается"}${s.status ? ` · ${esc(s.status)}` : ""}`;
  } else if (s.kind === "none") {
    cls = "bad";
    cdek =
      p.fromSheet && !robokassaInvoiceFrom(p.payment) && !dbEnabled()
        ? "⚠ Накладной нет — оформите отправление в личном кабинете СДЭК"
        : `⚠ Накладной нет${button(token, id, "Создать накладную")}`;
  } else if (s.kind === "rejected") {
    cls = "bad";
    cdek =
      p.fromSheet && !robokassaInvoiceFrom(p.payment) && !dbEnabled()
        ? `✕ ${esc(s.reason)} — оформите отправление в личном кабинете СДЭК`
        : `✕ ${esc(s.reason)}${button(token, id, "Создать заново")}`;
  } else {
    cls = "warn";
    cdek = `Не удалось проверить в СДЭК: ${esc(s.reason)}`;
  }
  const packedAt = FLAGS.get(id)?.packedAt ?? null;
  return `<article id="${esc(id)}" class="${cls}${waiting ? (packedAt ? " packed" : " wait") : ""}">
  <header><b>${esc(id)}</b><span>${esc(when(p))} · ${esc(rub(p.amount.value))}</span></header>
  ${hideButton(token, id)}
  <p class="who">${esc(m.name)} · ${esc(m.phone)} · ${m.kit ? `подарочный набор (JOS ${esc(m.kit)}) × ` : ""}${esc(m.qty)} шт.</p>
  ${waiting ? packButton(token, id, packedAt) : ""}
  ${p.fromSheet ? `<p class="tag">${esc(p.place || "из таблицы")}${/,/.test(p.place ?? "") ? " · из-за рубежа" : ""}</p>` : ""}
  ${m.delivery ? `<p class="dim">${esc(m.delivery)}</p>` : ""}
  ${p.sheetNote && s.kind !== "ok" ? `<p class="why">В таблице: ${esc(p.sheetNote.replace(/^.*?⚠\s*/, ""))}</p>` : ""}
  <div class="cdek">${cdek}</div>
  ${m.pvz && (s.kind === "none" || s.kind === "rejected") ? manualForm(token, id) : ""}
  ${storageLine(s, token, id, Boolean(m.email))}${mailsLine(p.marks)}${mailErrorLine(HISTORY.get(id))}
  ${historyBlock(HISTORY.get(id))}
</article>`;
}

const dateOf = (iso: string) =>
  iso
    ? new Date(iso).toLocaleString("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "";

/** Заказ «Ожидает оплаты» в Robokassa */
function awaitingCard(a: { order: SheetPaidOrder; invoice: string; state: string }, token: string): string {
  const o = a.order;
  return `<article class="idle">
  <header><b>${esc(o.id)}</b><span>${esc(dateOf(o.createdAt))} · ${esc(rub(String(o.total)))}</span></header>
  ${hideButton(token, o.id)}
  <p class="who">${esc(o.name)} · ${esc(o.phone)} · ${esc(o.quantity)} шт.</p>
  ${o.city ? `<p class="tag">${esc(o.city)}</p>` : ""}
  <p class="cdek">Robokassa, счёт ${esc(a.invoice)}: ${esc(a.state)}</p>
</article>`;
}

/** Заказ с листа «Международные заказы» (доставка не СДЭК) */
function intlCard(o: SheetPaidOrder, token: string): string {
  const paid = /^(Оплачена|Отправлена|Доставлена)$/.test(o.status ?? "");
  return `<article class="${paid ? "warn" : "idle"}">
  <header><b>${esc(o.id)}</b><span>${esc(dateOf(o.createdAt))} · ${esc(rub(String(o.total)))}</span></header>
  ${hideButton(token, o.id)}
  <p class="who">${esc(o.name)} · ${esc(o.phone)}${o.email ? ` · ${esc(o.email)}` : ""} · ${esc(o.quantity)} шт.</p>
  ${o.city ? `<p class="tag">${esc(o.city)}</p>` : ""}
  ${o.delivery ? `<p class="dim">${esc(o.delivery)}</p>` : ""}
  <p class="cdek">Статус: ${esc(o.status || "—")}${o.payment ? ` · ${esc(o.payment)}` : ""}</p>
  ${o.mailMarks ? `<p class="dim">Письма: ${esc(o.mailMarks)}</p>` : ""}
  ${intlPayForm(token, o, paid)}
</article>`;
}

/** Менеджер проверил данные → сумма в долларах (с доставкой) → письмо покупателю с суммой и реквизитами */
function intlPayForm(token: string, o: SheetPaidOrder, paid: boolean): string {
  if (paid || !mailEnabled()) return "";
  if (!validEmailAddr(o.email)) return `<p class="dim">Нет рабочей почты покупателя — письмо с реквизитами отправить нельзя.</p>`;
  if (!intlPaymentDetails())
    return `<p class="msg bad">Чтобы отправлять реквизиты, добавьте в настройки сайта (Timeweb) переменную INTL_PAYMENT_DETAILS — текст с реквизитами для перевода.</p>`;
  const itemsUsd = USD_RATE > 0 && o.total > 0 ? (Math.round((o.total / USD_RATE) * 100) / 100).toFixed(2) : "";
  const hint = USD_RATE > 0 ? `Товары ${esc(rub(String(o.total)))} по курсу ЦБ ${USD_RATE.toFixed(2).replace(".", ",")} ₽ за $1 — пересчитано автоматически. Доставку впишите сами.` : "Курс ЦБ сейчас недоступен — впишите сумму товаров в долларах сами.";
  const js = `var n=function(x){return parseFloat(String(x).replace(',','.'))||0};var t=n(this.items.value)+n(this.ship.value);return confirm('Отправить покупателю заказ ${esc(o.id)} на сумму $'+t.toFixed(2)+' (товары + доставка) и реквизиты?')`;
  return `<form method="post" class="manual" onsubmit="${js}">${hidden(token, { action: "intlpay", order: o.id })}<p class="dim">${hint}</p><label>Товары, $: <input name="items" inputmode="decimal" pattern="[0-9]+([.,][0-9]{1,2})?" required value="${itemsUsd}" placeholder="48.00"></label> <label>Доставка, $: <input name="ship" inputmode="decimal" pattern="[0-9]+([.,][0-9]{1,2})?" required placeholder="35.00"></label><button type="submit" class="alt">Данные проверены — отправить сумму и реквизиты</button></form>`;
}

const validEmailAddr = (s: string) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/.test(String(s || "").trim());

async function sendIntlPay(orderId: string, itemsRaw: string, shipRaw: string): Promise<{ ok: boolean; text: string }> {
  const num = (v: string) => Number(v.replace(",", ".").trim());
  const items = num(itemsRaw);
  const ship = num(shipRaw);
  if (!Number.isFinite(items) || items <= 0 || !Number.isFinite(ship) || ship < 0) return { ok: false, text: `${orderId}: впишите товары и доставку в долларах, например 48.00 и 35.00` };
  const amount = Math.round((items + ship) * 100) / 100;
  if (amount < 1 || amount > 10000) return { ok: false, text: `${orderId}: сумма $${amount} выглядит неверно` };
  const details = intlPaymentDetails();
  if (!details) return { ok: false, text: "Реквизиты не заданы: добавьте INTL_PAYMENT_DETAILS в настройки сайта." };
  const order = (await ordersOverview(60).catch(() => null))?.intl?.find((o) => o.id === orderId);
  if (!order) return { ok: false, text: `${orderId}: международный заказ не найден` };
  if (!validEmailAddr(order.email)) return { ok: false, text: `${orderId}: у покупателя нет рабочей почты` };
  try {
    await notifyIntlPay(mailOrderFrom(order), amount, details);
    if (dbEnabled()) await logOrderEvent(orderId, "intl_pay", `Менеджер отправил покупателю сумму $${amount.toFixed(2)} (товары $${items.toFixed(2)} + доставка $${ship.toFixed(2)}) и реквизиты`);
    return { ok: true, text: `${orderId}: покупателю ${order.email} отправлена сумма $${amount.toFixed(2)} и реквизиты.` };
  } catch (err) {
    return { ok: false, text: `${orderId}: письмо не отправлено — ${(err as Error).message}` };
  }
}

const SITE_ORIGIN = SITE.url.replace(/\/$/, "");

/** Итог сверки с ЮKassa: оплаты нашлись, а уведомления не было — значит, адрес уведомлений в ЮKassa не настроен */
function ykText(r: YooKassaReconcile, webhookUrl: string): string {
  return (
    `ЮKassa не прислала сайту уведомление об оплате заказов: ${r.fixed
      .map((f) => `${f.orderId}${f.ship ? (f.ship.ok ? (f.ship.trackingNumber ? ` (накладная № ${f.ship.trackingNumber})` : "") : ` (накладная не создана: ${f.ship.error})`) : ""}`)
      .join(", ")}. Сайт сам нашёл оплату: заказы отмечены оплаченными, покупателям ушло «Спасибо за заказ». ` +
    `Чтобы так было сразу после оплаты, в личном кабинете ЮKassa → Интеграция → HTTP-уведомления укажите адрес ${webhookUrl} и отметьте события payment.succeeded и payment.canceled.`
  );
}

/** Итог сверки с Robokassa — строкой над списком */
function reconcileText(r: ReconcileReport | null): string {
  if (!r?.paid.length) return "";
  return (
    "Robokassa: найдены оплаты, уведомление о которых до сайта не дошло — заказы отмечены оплаченными: " +
    r.paid
      .map(
        (p) =>
          `${p.orderId}${p.ship ? (p.ship.ok ? (p.ship.trackingNumber ? ` (накладная № ${p.ship.trackingNumber})` : " (накладная создана)") : ` (накладная не создана: ${p.ship.error})`) : ""}`,
      )
      .join(", ") +
    "."
  );
}

function mailState(): string {
  if (!mailEnabled())
    return `<p class="mailstate"><span class="off">Письма покупателям выключены</span>: в настройках сайта нет SMTP_USER и SMTP_PASSWORD.</p>`;
  const st = mailStatus();
  const via =
    st.routes[0] === "gmail"
      ? " через Gmail (скрипт таблицы)"
      : st.smtpDown && st.routes.includes("gmail")
        ? " через Gmail (скрипт таблицы): почтовый сервер Timeweb с хостинга недоступен"
        : st.routes.includes("gmail")
          ? " (если почтовый сервер Timeweb недоступен — через Gmail)"
          : "";
  return `<p class="mailstate">Письма покупателям: <b>включены</b>, отправляются с ${esc(mailFrom())}${esc(via)} — после оплаты, с трек-номером и за 2 дня до конца хранения.</p>`;
}

const ddmm = (d: Date) => d.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit" });

/** «Ждёт в пункте выдачи — хранение до 30.10» */
function storageLine(s: CdekState, token: string, orderId: string, hasEmail: boolean): string {
  if (s.kind !== "ok" || !AT_PICKUP_CODES.includes(String(s.statusCode))) return "";
  const until = storageUntil(s.arrivedAt, s.keepFreeUntil);
  // Напомнить вручную — в любой день, пока посылка в пункте выдачи (например, за день до конца хранения)
  const remind =
    hasEmail && s.number && mailEnabled()
      ? `<form method="post"><input type="hidden" name="token" value="${esc(token)}"><input type="hidden" name="action" value="remind"><input type="hidden" name="order" value="${esc(orderId)}"><button type="submit" class="alt">Напомнить покупателю о сроке хранения</button></form>`
      : "";
  if (!until) return `<p class="pick">Ждёт в пункте выдачи</p>${remind}`;
  const left = Math.ceil((until.getTime() - Date.now()) / 864e5);
  return `<p class="pick${left <= 2 ? " soon" : ""}">Ждёт в пункте выдачи — хранение до ${esc(ddmm(until))}${left >= 0 ? ` (осталось ${left} дн.)` : " (срок вышел)"}</p>${remind}`;
}

/** Кнопка «Напомнить о сроке хранения»: письмо покупателю прямо сейчас */
async function remindStorage(orderId: string): Promise<{ ok: boolean; text: string }> {
  const item = (await loadItems(60)).items.find((p) => p.metadata?.orderId === orderId);
  const m = item?.metadata;
  if (!item || !m) return { ok: false, text: `${orderId}: заказ не найден` };
  const s = await cdekState(orderId);
  if (s.kind !== "ok" || !s.number || !AT_PICKUP_CODES.includes(String(s.statusCode)))
    return { ok: false, text: `${orderId}: посылка сейчас не в пункте выдачи — напоминание не нужно` };
  const until = storageUntil(s.arrivedAt, s.keepFreeUntil) ?? new Date(Date.now() + 864e5);
  try {
    const sent = await notifyStorage(
      {
        id: orderId,
        email: m.email ?? "",
        name: m.name ?? "",
        quantity: Number(m.qty) || 1,
        total: Number(item.amount.value) || 0,
        delivery: m.delivery ?? "",
        ...(m.kit ? { kit: m.kit } : {}),
      },
      s.number,
      until,
      true,
    );
    return sent
      ? { ok: true, text: `${orderId}: напоминание о сроке хранения отправлено на ${m.email}` }
      : { ok: false, text: `${orderId}: письмо не отправлено — нет почты покупателя или письма выключены` };
  } catch (err) {
    return { ok: false, text: `${orderId}: письмо не отправлено — ${(err as Error).message}` };
  }
}

/** Последнее письмо покупателю не ушло — причина из истории заказа */
function mailErrorLine(events?: { at: string; kind: string; text: string }[]): string {
  const last = [...(events ?? [])].reverse().find((e) => e.kind === "mail" || e.kind === "mail_error");
  return last?.kind === "mail_error" ? `<p class="why">✕ ${esc(last.text)}</p>` : "";
}

/** Какие письма покупателю уже ушли (по отметкам в таблице) */
function mailsLine(marks?: string): string {
  if (marks === undefined) return "";
  if (/^импорт без отметок/m.test(marks))
    return `<p class="mails">Письма: неизвестно, какие уходили раньше (заказ перенесён из старых) — сайт сам не пишет, чтобы не повторяться</p>`;
  const has = (re: RegExp) => re.test(marks);
  const items = [
    has(/оплата/i) ? "✓ спасибо за заказ" : "",
    has(/трек/i) ? "✓ трек-номер" : "",
    has(/хранение/i) ? "✓ напоминание о хранении" : "",
  ].filter(Boolean);
  return `<p class="mails">Письма: ${items.length ? items.join(" · ") : "ещё не отправлялись"}</p>`;
}

function mailButton(token: string) {
  return `<form method="post" class="sync"><input type="hidden" name="token" value="${esc(token)}"><input type="hidden" name="action" value="mail"><button type="submit" class="alt">Проверить и отправить письма покупателям</button></form>`;
}

const hidden = (token: string, fields: Record<string, string>) =>
  `<input type="hidden" name="token" value="${esc(token)}">` +
  Object.entries(fields)
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
    .join("");

let SHOW_HIDDEN = false;
/** Курс ЦБ ₽ за $1 — для пересчёта суммы международных заказов в доллары */
let USD_RATE = 0;

/** «Скрыть» / «Вернуть» — работает, когда подключена база */
function hideButton(token: string, orderId: string): string {
  if (!dbEnabled()) return "";
  return SHOW_HIDDEN
    ? `<form method="post" class="hide">${hidden(token, { action: "unhide", order: orderId })}<button type="submit" class="link">Вернуть на страницу</button></form>`
    : `<form method="post" class="hide">${hidden(token, { action: "hide", order: orderId })}<button type="submit" class="link" title="Убрать заказ со страницы (например, отправку оформили сами)">Скрыть</button></form>`;
}

/** Накладную оформили сами в личном кабинете СДЭК — номер, чтобы сайт следил за посылкой и написал покупателю */
function manualForm(token: string, orderId: string): string {
  if (!dbEnabled()) return "";
  return `<form method="post" class="manual">${hidden(token, { action: "manual", order: orderId })}<label>Оформили накладную сами? № СДЭК: <input name="tracking" inputmode="numeric" pattern="[0-9]{6,14}" required placeholder="1033…"></label><button type="submit" class="alt">Сохранить и написать покупателю</button></form>`;
}

let FOUND = "";

/** Поиск заказа по номеру KA-…, телефону или фамилии — в том числе среди скрытых */
function findForm(token: string): string {
  if (!dbEnabled()) return "";
  return `<form method="post" class="manual rk">${hidden(token, { action: "find" })}<label>Найти заказ (за всё время): <input name="q" required placeholder="№ заказа, почта, телефон или фамилия"></label><button type="submit" class="alt">Найти</button></form>${FOUND}`;
}

const STATUS_RU: Record<string, string> = {
  paid: "оплачен",
  awaiting_payment: "ждёт оплаты",
  pending: "создан, не оплачен",
  new: "заявка, не оплачен",
  failed: "оплата не прошла",
  canceled: "отменён",
};

async function findOrders(token: string, q: string): Promise<string> {
  const text = q.trim().slice(0, 60);
  if (text.length < 3) return `<p class="msg bad">Введите хотя бы 3 символа.</p>`;
  const digits = text.replace(/\D/g, "");
  const like = (v: string) => `%${v.replace(/[\\%_]/g, "\\$&")}%`;
  const r = await sql<{ id: string; status: string; created_at: string; name: string; phone: string; email: string; total: string; paid_at: string | null }>(
    `select id, status, created_at, name, phone, email, total, paid_at from orders
      where upper(id) like upper($1) or lower(name) like lower($1) or lower(email) like lower($1) or ($2 <> '' and regexp_replace(phone, '\\D', '', 'g') like $3)
      order by created_at desc limit 25`,
    [like(text), digits.length >= 4 ? digits : "", like(digits)],
  );
  if (!r.rows.length)
    return `<p class="msg bad">«${esc(text)}» в базе нет. Значит, заказ не был создан (например, покупатель не дошёл до оплаты или форма не отправилась).</p>`;
  const flags = await orderFlags().catch(() => new Map<string, OrderFlags>());
  const rows = r.rows.map((o) => {
    const isHid = flags.get(o.id)?.hidden === true;
    const st = STATUS_RU[o.status] ?? o.status;
    const btn = `<form method="post" class="hide">${hidden(token, { action: isHid ? "unhide" : "hide", order: o.id })}<button type="submit" class="link">${isHid ? "Вернуть на страницу" : "Скрыть"}</button></form>`;
    return `<article><b>${esc(o.id)}</b> · ${esc(dateOf(o.created_at))} · ${esc(o.name)} · ${esc(o.email)} · ${esc(o.phone)} · ${esc(Math.round(Number(o.total)))} ₽ · ${esc(st)}${
      isHid ? ` · <b>скрыт</b>` : ""
    }${btn}</article>`;
  });
  return `<p class="msg ok">Найдено: ${r.rows.length} (поиск идёт по всем заказам за всё время)</p>${rows.join("\n")}`;
}

/** Проверка счёта Robokassa по номеру */
function rkCheckForm(token: string): string {
  if (!features.robokassa) return "";
  return `<form method="post" class="manual rk">${hidden(token, { action: "rkcheck" })}<label>Проверить оплату Robokassa: <input name="q" required placeholder="№ счёта или KA-…"></label><button type="submit" class="alt">Проверить</button></form>`;
}

/** Сохранить номер накладной, оформленной вручную, и отправить покупателю письмо с трек-номером */
async function saveManual(orderId: string, number: string): Promise<{ ok: boolean; text: string }> {
  const n = number.replace(/\D/g, "");
  if (!/^\d{6,14}$/.test(n)) return { ok: false, text: `${orderId}: номер накладной СДЭК — только цифры` };
  await setManualTracking(orderId, n);
  const item = (await loadItems(60)).items.find((p) => p.metadata?.orderId === orderId);
  const m = item?.metadata ?? {};
  const base = (m.delivery || (m.pvz ? `СДЭК ПВЗ ${m.pvz}` : "")).replace(/ · ⚠.*$/, "");
  await updateOrderStrict(orderId, {
    delivery: { provider: "cdek", label: `${base} · трек ${n} (оформлена вручную)`, cdek: { ...(m.pvz ? { pickupPointCode: m.pvz } : {}), trackingNumber: n } },
  }).catch((err) => console.error(`[cdek-orders] ${orderId}:`, err));
  let mail = "";
  if (m.email) {
    try {
      const sent = await notifyTrack(
        { id: orderId, email: m.email, name: m.name ?? "", quantity: Number(m.qty) || 1, total: Number(item?.amount.value) || 0, delivery: base, ...(m.kit ? { kit: m.kit } : {}) },
        n,
      );
      mail = sent ? ` Покупателю отправлено письмо с трек-номером (${m.email}).` : " Письмо с этим номером уже уходило или письма выключены.";
    } catch (err) {
      mail = ` Письмо не отправлено: ${(err as Error).message}`;
    }
  }
  return { ok: true, text: `${orderId}: сохранена накладная № ${n}.${mail}` };
}

function importButton(token: string) {
  return `<form method="post" class="sync"><input type="hidden" name="token" value="${esc(token)}"><input type="hidden" name="action" value="import"><button type="submit" class="alt">Обновить перенесённые заказы из таблицы и ЮKassa</button></form>`;
}

function importText(r: ImportReport): { ok: boolean; text: string } {
  return {
    ok: !r.errors.length,
    text:
      `Старые заказы перенесены в базу: новых ${r.imported}, обновлено ${r.updated}.` +
      (r.sheetMissing ? " Таблица не отдала заказы (обновите основной скрипт таблицы) — перенесены только оплаты ЮKassa, письма по ним сайт сам не отправляет." : "") +
      (r.errors.length ? ` Ошибки: ${r.errors.slice(0, 5).join("; ")}` : ""),
  };
}

function syncButton(token: string) {
  return `<form method="post" class="sync"><input type="hidden" name="token" value="${esc(token)}"><input type="hidden" name="action" value="sync"><button type="submit">Записать трек-номера в таблицу</button></form>`;
}

/** Номера СДЭК → колонка «Доставка» таблицы (как пишет её сайт после оплаты: «… · трек 1234567890») */
async function syncTracks(days: number): Promise<{ ok: boolean; text: string }> {
  let payments: Item[];
  try {
    payments = (await loadItems(days)).items.filter((p) => p.metadata?.pvz && p.metadata?.orderId);
  } catch (err) {
    return { ok: false, text: `Не удалось получить платежи из ЮKassa: ${(err as Error).message}` };
  }
  const states = await statesFor(payments);
  let written = 0;
  const failed: string[] = [];
  for (let i = 0; i < payments.length; i++) {
    const s = states[i];
    if (s.kind !== "ok" || !s.number) continue;
    const m = payments[i].metadata!;
    const base = m.delivery || `СДЭК ПВЗ ${m.pvz}`;
    try {
      await updateOrderStrict(m.orderId!, {
        delivery: {
          provider: "cdek",
          label: `${base} · трек ${s.number}`,
          cdek: { pickupPointCode: m.pvz!, trackingNumber: s.number },
        },
      });
      written++;
    } catch {
      failed.push(m.orderId!);
    }
  }
  const noNumber = states.filter((s) => s.kind !== "ok" || !s.number).length;
  return {
    ok: failed.length === 0,
    text:
      `Трек-номера записаны в таблицу: ${written}.` +
      (noNumber ? ` Без номера СДЭК: ${noNumber}.` : "") +
      (failed.length ? ` Не удалось записать: ${failed.join(", ")}.` : ""),
  };
}

function page(body: string): Response {
  return new Response(
    `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Накладные СДЭК</title>
<style>
:root{color-scheme:light dark;--bg:#f6f6f7;--card:#fff;--line:#e3e3e6;--dim:#6b6b73;--ok:#1d8a4e;--bad:#c62828;--warn:#9a6a00;--waitbg:#fff4c2}
@media (prefers-color-scheme:dark){:root{--bg:#111113;--card:#1b1b1e;--line:#2c2c31;--dim:#9a9aa3;--ok:#4cc38a;--bad:#ff6b6f;--warn:#e3b341;--waitbg:#3a3010}}
*{box-sizing:border-box}body{margin:0;padding:16px;background:var(--bg);font:15px/1.45 -apple-system,system-ui,Segoe UI,Roboto,sans-serif}
main{max-width:720px;margin:0 auto}h1{font-size:22px;margin:4px 0 6px}.lead{color:var(--dim);margin:0 0 16px}
.msg{padding:12px 14px;border-radius:10px;margin:0 0 16px;font-weight:600}.msg.ok{background:rgba(29,138,78,.12);color:var(--ok)}.msg.bad{background:rgba(198,40,40,.12);color:var(--bad)}
article{background:var(--card);border:1px solid var(--line);border-left-width:4px;border-radius:10px;padding:12px 14px;margin:0 0 10px}
article.wait{background:var(--waitbg);border-color:var(--warn)}h2{font-size:17px;margin:22px 0 10px}h2 small{color:var(--dim);font-weight:400}
article.ok{border-left-color:var(--ok)}article.idle{border-left-color:var(--line)}.why{margin-top:6px;font-size:13px;color:var(--bad)}article.bad{border-left-color:var(--bad)}article.warn{border-left-color:var(--warn)}
header{display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 12px}header span{color:var(--dim)}
p{margin:6px 0 0}.tag{display:inline-block;margin:6px 0 0;padding:2px 8px;border-radius:6px;background:rgba(0,0,0,.07);font-size:13px;font-weight:600}.dim{color:var(--dim);font-size:13px}.cdek{margin-top:8px;font-weight:600}
.pick{margin-top:6px;font-weight:600;color:var(--warn)}.pick.soon{color:var(--bad)}.mails{margin-top:6px;font-size:13px;color:var(--dim)}
.mailstate{margin:0 0 12px;font-size:14px}.mailstate b{color:var(--ok)}.mailstate .off{color:var(--bad)}button.alt{background:#222;color:#fff}
.ok .cdek{color:var(--ok)}.bad .cdek{color:var(--bad)}.warn .cdek{color:var(--warn)}
form{display:inline}.sync{display:block;margin:0 0 16px}button{margin:8px 0 0;display:block;padding:10px 16px;border:0;border-radius:8px;background:#e3161b;color:#fff;font:inherit;font-weight:700}
nav{margin:18px 0 0;color:var(--dim);font-size:13px}nav a{color:inherit}
.hide{float:right;margin:-2px 0 0 8px}
.pack{display:block}.packbtn{margin:10px 0 2px;padding:12px 18px;font-size:16px;background:#fff;color:#111;border:2px solid #111;min-width:150px}
.packbtn.on{background:var(--ok);border-color:var(--ok);color:#fff}
article.packed{background:rgba(29,138,78,.12);border-color:var(--ok)}button.link{background:none;color:var(--dim);padding:0;margin:4px 0 0;font-weight:400;font-size:13px;text-decoration:underline}
.manual{display:block;margin-top:8px;font-size:13px}.manual input{font:inherit;padding:6px 8px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:inherit;width:150px}.rk{margin:0 0 16px}
.hist{margin-top:8px;font-size:13px}.hist summary{cursor:pointer;color:var(--dim)}.hist ul{margin:6px 0 0;padding-left:18px}.hist li span{color:var(--dim)}
</style></head><body><main>${body}</main></body></html>`,
    { status: 200, headers: HEADERS },
  );
}

async function render(token: string, days: number, message?: { ok: boolean; text: string }, showHidden = false): Promise<Response> {
  SHOW_HIDDEN = showHidden;
  FLAGS = await orderFlags().catch(() => new Map());
  const isHidden = (id: string) => FLAGS.get(id)?.hidden === true;
  if (!features.payments || !features.cdek) return page("<h1>Накладные СДЭК</h1><p>ЮKassa или СДЭК не подключены на сервере.</p>");
  let loaded: Loaded;
  let rec: ReconcileReport | null = null;
  let yk: YooKassaReconcile | null = null;
  let dbLine = "";
  let importNote: { ok: boolean; text: string } | null = null;
  if (dbEnabled()) {
    try {
      if (!(await importedAt())) importNote = importText(await importOldOrders());
      const n = (await sql<{ n: number }>("select count(*)::int as n from orders")).rows[0]?.n ?? 0;
      const hook = await getSetting("yookassa_webhook_at").catch(() => null);
      dbLine = `<p class="mailstate">База данных: <b>подключена</b>, заказов в ней: ${n}. Таблица Google — копия для просмотра. Последнее уведомление ЮKassa об оплате: ${hook ? esc(dateOf(hook)) : "пока не приходило"}.${
        dbTlsUnverified() ? " Соединение с базой шифруется; чтобы сайт ещё и проверял сертификат базы, добавьте в настройки DATABASE_CA (сертификат Timeweb)." : ""
      }</p>${importButton(token)}`;
    } catch (err) {
      dbLine = `<p class="msg bad">База данных недоступна: ${esc((err as Error).message)}. Заказы показаны из таблицы и ЮKassa там, где это возможно.</p>`;
    }
  }
  try {
    loaded = await loadItems(days);
    // Заказы «Ожидает оплаты» в Robokassa: вдруг оплачены, а уведомление не дошло
    if (loaded.awaiting?.length && features.robokassa) {
      rec = await reconcileRobokassa(loaded.awaiting);
      if (rec.paid.length) loaded = await loadItems(days);
    }
    // Оплаты ЮKassa, о которых сайт не узнал (уведомление не дошло)
    if (dbEnabled()) {
      yk = await reconcileYooKassa().catch((err) => ({ fixed: [], errors: [(err as Error).message] }));
      if (yk.fixed.length) loaded = await loadItems(days);
    }
  } catch (err) {
    return page(`<h1>Накладные СДЭК</h1><p class="msg bad">Не удалось получить платежи из ЮKassa: ${esc((err as Error).message)}</p>`);
  }
  const all = loaded.items;
  const hiddenCount = all.filter((p) => isHidden(p.metadata?.orderId ?? "")).length;
  const payments = all.filter((p) => isHidden(p.metadata?.orderId ?? "") === showHidden);
  const note = loaded.note;
  const paidNow = new Set(rec?.paid.map((p) => p.orderId));
  const pending = (rec?.pending ?? (loaded.awaiting ?? []).map((o) => ({ order: o, invoice: robokassaInvoiceFrom(o.payment) ?? "?", state: "не проверен" }))).filter(
    (a) => !paidNow.has(a.order.id) && isHidden(a.order.id) === showHidden,
  );
  const intl = (loaded.intl ?? []).filter((o) => isHidden(o.id) === showHidden);
  if (intl.length) USD_RATE = (await getUsdRate().catch(() => null))?.rate ?? 0;
  const recText = reconcileText(rec);
  HISTORY = await orderEvents(payments.map((p) => p.metadata?.orderId ?? "").filter(Boolean)).catch(() => new Map());
  const states = await statesFor(payments);
  const missing = payments.filter((p, i) => p.metadata?.pvz && (states[i].kind === "none" || states[i].kind === "rejected")).length;
  const waiting: string[] = [];
  const shipped: string[] = [];
  // несобранные — сверху, собранные — ниже (зелёные), чтобы сборщик не путался
  const waitIdx: number[] = [];
  payments.forEach((p, i) => {
    if (notShipped(p, states[i])) waitIdx.push(i);
    else shipped.push(card(p, states[i], token));
  });
  const packedOf = (i: number) => Boolean(FLAGS.get(payments[i].metadata?.orderId ?? "")?.packedAt);
  const packedCount = waitIdx.filter(packedOf).length;
  for (const i of [...waitIdx.filter((i) => !packedOf(i)), ...waitIdx.filter(packedOf)]) waiting.push(card(payments[i], states[i], token, true));
  const hiddenTotal = [...FLAGS.values()].filter((f) => f.hidden).length;
  const other = days === 30 ? 60 : 30;
  const base = `?token=${esc(encodeURIComponent(token))}`;
  const webhookUrl = `${SITE_ORIGIN}/api/payments/yookassa/webhook`;
  if (showHidden)
    return page(`<h1>Скрытые заказы</h1>
${message ? `<p class="msg ${message.ok ? "ok" : "bad"}">${esc(message.text)}</p>` : ""}
<p class="lead"><a href="${base}">← ко всем заказам</a></p>
${[...waiting, ...shipped, ...pending.map((a) => awaitingCard(a, token)), ...intl.map((o) => intlCard(o, token))].join("\n") || "<p class=\"dim\">Скрытых заказов нет.</p>"}`);
  return page(`<h1>Накладные СДЭК</h1>
<p class="lead">Оплаченные заказы за ${days} дн.: ${payments.length}. Ждут отправки: <b>${waiting.length}</b>${missing ? ` (без накладной: <b>${missing}</b>)` : ""}.</p>
${hiddenTotal ? `<p class="lead"><a href="${base}&hidden=1&days=${days}">Скрытые заказы · ${hiddenTotal} — открыть и вернуть</a></p>` : ""}
${message ? `<p class="msg ${message.ok ? "ok" : "bad"}">${esc(message.text)}</p>` : ""}
${importNote ? `<p class="msg ${importNote.ok ? "ok" : "bad"}">${esc(importNote.text)}</p>` : ""}
${recText ? `<p class="msg ok">${esc(recText)}</p>` : ""}
${yk?.fixed.length ? `<p class="msg bad">${esc(ykText(yk, webhookUrl))}</p>` : ""}
${rec?.keysError ? `<p class="msg bad">${esc(rec.keysError)}</p>` : ""}
${note ? `<p class="msg bad">${esc(note)}</p>` : ""}
<p class="lead"><a href="/sales${base}">Продажи по периодам (с 20-го по 20-е) →</a></p>
${dbLine}
${mailState()}
${findForm(token)}
${rkCheckForm(token)}
${payments.length ? syncButton(token) + (mailEnabled() ? mailButton(token) : "") : ""}
${
  payments.length
    ? `<h2>Не отправлены <small>— посылку ещё не сдали в СДЭК</small> · ${waiting.length}${
        dbEnabled() && waiting.length ? ` <small>· собрано ${packedCount} из ${waiting.length}</small>` : ""
      }</h2>
${waiting.join("\n") || "<p class=\"dim\">Все оплаченные заказы уже переданы в СДЭК.</p>"}
<h2>Переданы в СДЭК · ${shipped.length}</h2>
${shipped.join("\n") || "<p class=\"dim\">Пока нет.</p>"}`
    : "<p>Оплаченных заказов пока нет.</p>"
}
${
  pending.length
    ? `<h2>Ждут оплаты в Robokassa <small>— из-за рубежа, сайт сверяет их с Robokassa при открытии страницы и раз в 30 минут</small> · ${pending.length}</h2>
${pending.map((a) => awaitingCard(a, token)).join("\n")}`
    : ""
}
${
  intl.length
    ? `<h2>Международные заказы <small>— лист «Международные заказы», доставка не СДЭК, оформляется вручную</small> · ${intl.length}</h2>
${intl.map((o) => intlCard(o, token)).join("\n")}`
    : ""
}
<nav><a href="/sales${base}"><b>Продажи по периодам (с 20-го по 20-е) →</b></a><br>Показаны последние ${days} дн. · <a href="${base}&days=${other}">показать за ${other} дн.</a>${
    hiddenCount || [...FLAGS.values()].some((f) => f.hidden) ? ` · <a href="${base}&hidden=1&days=${days}">скрытые заказы</a>` : ""
  }</nav>`);
}

const daysFrom = (v: string | null) => Math.min(60, Math.max(1, Number.parseInt(v ?? "", 10) || 30));

/** Любая непредвиденная ошибка — текстом на странице, а не «HTTP ERROR 500» */
function crashed(err: unknown): Response {
  console.error("[cdek-orders]", err);
  return page(`<h1>Накладные СДЭК</h1><p class="msg bad">Страница не открылась: ${esc(String((err as Error)?.message ?? err).slice(0, 400))}</p>`);
}

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const token = q.get("token");
  if (!authorized(token)) return notFound();
  return render(token!, daysFrom(q.get("days")), undefined, q.get("hidden") === "1").catch(crashed);
}

export async function POST(request: Request) {
  return handlePost(request).catch(crashed);
}

async function handlePost(request: Request): Promise<Response> {
  const form = await request.formData().catch(() => null);
  const token = String(form?.get("token") ?? "");
  if (!authorized(token)) return notFound();
  const days = 30;
  if (form?.get("action") === "sync") return render(token, days, await syncTracks(60));
  const act = String(form?.get("action") ?? "");
  const oid = String(form?.get("order") ?? "");
  if (act === "hide" || act === "unhide") {
    await setHidden(oid, act === "hide");
    return render(token, days, { ok: true, text: act === "hide" ? `${oid} скрыт. Вернуть — внизу страницы, «скрытые заказы».` : `${oid} снова на странице.` }, act === "unhide");
  }
  if (act === "find") {
    FOUND = await findOrders(token, String(form?.get("q") ?? "")).catch((err) => `<p class="msg bad">Поиск не удался: ${esc((err as Error).message)}</p>`);
    try {
      return await render(token, days);
    } finally {
      FOUND = "";
    }
  }
  if (act === "intlpay") return render(token, days, await sendIntlPay(oid, String(form?.get("items") ?? ""), String(form?.get("ship") ?? "")));
  if (act === "pack" || act === "unpack") {
    await setPacked(oid, act === "pack");
    await logOrderEvent(oid, "pack", act === "pack" ? "Сборщик: собран" : "Сборщик: отметка «собран» снята");
    return render(token, days);
  }
  if (act === "manual") return render(token, days, await saveManual(oid, String(form?.get("tracking") ?? "")));
  if (act === "rkcheck")
    return render(token, days, await checkRobokassaInvoice(String(form?.get("q") ?? "")).catch((err) => ({ ok: false, text: `Проверка не удалась: ${(err as Error).message}` })));
  if (form?.get("action") === "import") {
    const r = await importOldOrders().then(importText, (err) => ({ ok: false, text: `Перенос не удался: ${(err as Error).message}` }));
    return render(token, days, r);
  }
  if (form?.get("action") === "remind") return render(token, days, await remindStorage(String(form.get("order") ?? "")));
  if (form?.get("action") === "mail") {
    const r = await runMailJobs().catch((err) => ({ skipped: (err as Error).message, paid: 0, track: 0, storage: 0, errors: [] as string[] }));
    const text = r.skipped
      ? `Письма не отправлены: ${r.skipped}`
      : `Проверено. Отправлено писем: «спасибо за заказ» — ${r.paid}, с трек-номером — ${r.track}, о сроке хранения — ${r.storage}.` +
        (r.errors.length ? ` Ошибки: ${r.errors.join("; ")}` : "");
    return render(token, days, { ok: !r.skipped && !r.errors.length, text });
  }
  const orderId = String(form?.get("order") ?? "");
  const payment = (await listPaidSiteOrders(60).catch(() => [] as YooKassaPayment[])).find(
    (p) => p.metadata?.orderId === orderId,
  );
  let result: ShipResult;
  if (payment) result = await shipPaidOrder(payment, { retryRejected: true });
  else {
    // Оплата через Robokassa: данные для накладной — из счёта Robokassa
    const sheetOrder = (await ordersOverview(60, false).catch(() => null))?.paid.find((o) => o.id === orderId);
    if (!sheetOrder) result = { ok: false, error: `оплаченный заказ ${orderId} не найден ни в ЮKassa, ни в таблице` };
    else result = await shipRobokassaOrder(sheetOrder, true).catch((err) => ({ ok: false as const, error: (err as Error).message }));
  }
  const text = result.ok
    ? `${orderId}: ${result.existed ? "накладная уже была" : "накладная создана"}${result.trackingNumber ? ` — № ${result.trackingNumber}` : ""}. В таблице обновлена колонка «Доставка».`
    : `${orderId}: СДЭК не создал накладную — ${result.error}`;
  return render(token, days, { ok: result.ok, text });
}
