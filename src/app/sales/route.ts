/**
 * /sales?token=<PAYMENTS_TEST_TOKEN>[&from=2026-10-20&to=2026-11-19] — отчёт о продажах для продавца.
 *
 * Отчётный период — с 20-го числа по 20-е следующего месяца (20-е относится уже к новому периоду):
 * например, «20 октября – 19 ноября». Страница показывает итог за выбранный период, список его заказов
 * и таблицу по всем периодам. Можно задать и произвольные даты.
 * Считаются оплаченные заказы (оплачен, отправлен, доставлен) по дате оплаты, время московское.
 * Раздел «Склад»: товар приходит партиями — продавец вносит поступления и «продано вне сайта», страница показывает,
 * сколько сейчас в наличии; когда остаётся мало, сайт пишет на указанную почту (src/lib/warehouse.ts).
 * Тестовые платежи не учитываются. Нужна база данных (DATABASE_URL). Без правильного токена отвечает 404.
 */
import { sql } from "@/lib/db/pg";
import { dbEnabled, ensureSchema } from "@/lib/db/schema";
import { mailEnabled, validEmail } from "@/lib/mail/notify";
import { addBatch, checkLowStock, deleteBatch, saveWarehouseSettings, sendStockMail, warehouse, type Warehouse } from "@/lib/warehouse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
};

/** День, с которого начинается отчётный период */
const START_DAY = 20;
const MSK = 3 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

function authorized(given: string | null | undefined): boolean {
  const token = process.env.PAYMENTS_TEST_TOKEN ?? "";
  return token.length >= 8 && given === token;
}

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const rub = (v: number) => `${Math.round(v).toLocaleString("ru-RU")} ₽`;

/** Дата «2026-10-20» по московскому времени ↔ момент времени */
const ymd = (t: number) => new Date(t + MSK).toISOString().slice(0, 10);
const startOf = (day: string) => Date.parse(`${day}T00:00:00Z`) - MSK;
const isDay = (v: string | null): v is string => /^\d{4}-\d{2}-\d{2}$/.test(v ?? "") && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const human = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).replace(" г.", "");

/** Первый день отчётного периода, в который попадает момент t («2026-10-20») */
function periodStart(t: number): string {
  const d = new Date(t + MSK);
  let y = d.getUTCFullYear();
  let m = d.getUTCMonth();
  if (d.getUTCDate() < START_DAY) m -= 1;
  if (m < 0) {
    m = 11;
    y -= 1;
  }
  return `${y}-${String(m + 1).padStart(2, "0")}-${START_DAY}`;
}

/** Первый день следующего периода */
function nextPeriod(start: string): string {
  const [y, m] = start.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-${START_DAY}` : `${y}-${String(m + 1).padStart(2, "0")}-${START_DAY}`;
}

interface Sale {
  id: string;
  at: number;
  name: string;
  qty: number;
  kit: boolean;
  goods: number;
  delivery: number;
  total: number;
  abroad: boolean;
}

interface Sum {
  orders: number;
  chalk: number;
  kits: number;
  goods: number;
  delivery: number;
  total: number;
}

function sum(list: Sale[]): Sum {
  const s: Sum = { orders: 0, chalk: 0, kits: 0, goods: 0, delivery: 0, total: 0 };
  for (const o of list) {
    s.orders += 1;
    if (o.kit) s.kits += o.qty;
    else s.chalk += o.qty;
    s.goods += o.goods;
    s.delivery += o.delivery;
    s.total += o.total;
  }
  return s;
}

async function loadSales(): Promise<Sale[]> {
  await ensureSchema();
  const r = await sql<{
    id: string;
    at: string;
    name: string;
    total: string;
    qty: string | null;
    product: string | null;
    goods: string | null;
    delivery: string | null;
    cc: string | null;
  }>(
    `select id, coalesce(paid_at, created_at) as at, name, total,
            data->>'quantity' as qty, data->>'product' as product, data->>'itemsTotal' as goods, data->>'deliveryCost' as delivery,
            data->'delivery'->'cdek'->>'countryCode' as cc
       from orders
      where status in ('paid','shipped','delivered') and coalesce(data->'payment'->>'test', 'false') <> 'true'
      order by 2 desc`,
  );
  return r.rows.map((o) => {
    const total = Number(o.total) || 0;
    const delivery = Number(o.delivery) || 0;
    return {
      id: o.id,
      at: new Date(o.at).getTime(),
      name: o.name,
      qty: Number(o.qty) || 1,
      kit: o.product === "kit",
      // у старых заказов, перенесённых из таблицы, стоимость товаров отдельно не записана
      goods: Number(o.goods) || total - delivery,
      delivery,
      total,
      abroad: Boolean(o.cc && o.cc !== "RU"),
    };
  });
}

function page(body: string, status = 200): Response {
  return new Response(
    `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Продажи</title>
<style>
:root{color-scheme:light dark;--bg:#f6f6f7;--card:#fff;--line:#e3e3e6;--dim:#6b6b73;--ok:#1d8a4e;--bad:#c62828;--hi:rgba(227,22,27,.08)}
@media (prefers-color-scheme:dark){:root{--bg:#111113;--card:#1b1b1e;--line:#2c2c31;--dim:#9a9aa3;--ok:#4cc38a;--bad:#ff6b6f;--hi:rgba(227,22,27,.18)}}
*{box-sizing:border-box}body{margin:0;padding:16px;background:var(--bg);font:15px/1.45 -apple-system,system-ui,Segoe UI,Roboto,sans-serif}
main{max-width:860px;margin:0 auto}h1{font-size:22px;margin:4px 0 6px}h2{font-size:17px;margin:26px 0 10px}.lead,.dim{color:var(--dim)}.lead{margin:0 0 16px}
a{color:inherit}.msg{padding:12px 14px;border-radius:10px;font-weight:600;background:rgba(198,40,40,.12);color:var(--bad)}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:12px 0}
.tile{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}.tile b{display:block;font-size:26px;line-height:1.2}.tile span{color:var(--dim);font-size:13px}
.tile.main{border-color:#e3161b}
form{display:flex;flex-wrap:wrap;align-items:flex-end;gap:10px;margin:0 0 6px}label{display:grid;gap:4px;font-size:13px;color:var(--dim)}
input{font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:inherit}
button{padding:9px 16px;border:0;border-radius:8px;background:#e3161b;color:#fff;font:inherit;font-weight:700;cursor:pointer}
.wrap{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:10px}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{padding:9px 12px;text-align:right;white-space:nowrap;border-bottom:1px solid var(--line)}
th{color:var(--dim);font-weight:600;font-size:12px}th:first-child,td:first-child{text-align:left}tr:last-child td{border-bottom:0}
tr.cur td{background:var(--hi);font-weight:600}tfoot td{font-weight:700;border-top:2px solid var(--line)}
nav{margin:22px 0 0;color:var(--dim);font-size:13px}
.msg.ok{background:rgba(29,138,78,.12);color:var(--ok)}.tile.low{border-color:var(--bad)}.tile.low b{color:var(--bad)}
.box{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin:10px 0}.box h3{margin:0 0 8px;font-size:15px}
.box form{margin:0}input[type=number]{width:110px}input.wide{width:220px}button.alt{background:#222}button.link{background:none;color:var(--dim);padding:0;font-weight:400;font-size:13px;text-decoration:underline}
td form{display:inline;margin:0}.formula{margin:4px 0 0;font-size:13px;color:var(--dim)}
</style></head><body><main>${body}</main></body></html>`,
    { status, headers: HEADERS },
  );
}

function tiles(s: Sum): string {
  const tile = (value: string, label: string, main = false) => `<div class="tile${main ? " main" : ""}"><b>${esc(value)}</b><span>${esc(label)}</span></div>`;
  return `<div class="tiles">
${tile(`${(s.chalk + s.kits).toLocaleString("ru-RU")} шт.`, "продано всего (мел + наборы)", true)}
${tile(`${s.chalk.toLocaleString("ru-RU")} шт.`, "мел")}
${tile(`${s.kits.toLocaleString("ru-RU")} шт.`, "подарочные наборы")}
${tile(String(s.orders), "заказов")}
${tile(rub(s.goods), "выручка за товар")}
${tile(rub(s.delivery), "доставка, оплаченная покупателями")}
${tile(rub(s.total), "получено всего")}
</div>`;
}

const MESSAGES: Record<string, { ok: boolean; text: string }> = {
  batch: { ok: true, text: "Партия добавлена." },
  deleted: { ok: true, text: "Запись удалена." },
  saved: { ok: true, text: "Настройки склада сохранены." },
  alerted: { ok: true, text: "Изменения сохранены. Товара мало — письмо с предупреждением отправлено." },
  mailed: { ok: true, text: "Проверочное письмо отправлено — посмотрите почту (и папку «Спам»)." },
  badqty: { ok: false, text: "Количество — целое число, не ноль (со знаком минус — списание)." },
  baddate: { ok: false, text: "Укажите дату поступления." },
  badmail: { ok: false, text: "Проверьте адрес почты." },
  badnum: { ok: false, text: "«Продано вне сайта» и порог — целые числа от нуля." },
};

function stockSection(token: string, w: Warehouse, today: string): string {
  const hid = `<input type="hidden" name="token" value="${esc(token)}">`;
  const tile = (value: string, label: string, cls = "") => `<div class="tile ${cls}"><b>${esc(value)}</b><span>${esc(label)}</span></div>`;
  const started = w.batches.length > 0;
  const low = started && w.onHand <= w.threshold;
  const rows = w.batches.map(
    (b) =>
      `<tr><td>${esc(human(b.receivedOn))}${b.note ? ` <span class="dim">· ${esc(b.note)}</span>` : ""}</td><td>${b.qty > 0 ? "+" : ""}${b.qty}</td><td><form method="post" onsubmit="return confirm('Удалить эту запись?')">${hid}<input type="hidden" name="action" value="batch_del"><input type="hidden" name="id" value="${b.id}"><button class="link">удалить</button></form></td></tr>`,
  );
  return `<h2>Склад <span class="dim">— сколько товара сейчас в наличии</span></h2>
${
  started
    ? `<div class="tiles">
${tile(`${w.onHand.toLocaleString("ru-RU")} шт.`, low ? `в наличии — мало (порог ${w.threshold})` : "в наличии", low ? "low" : "main")}
${tile(`${w.received.toLocaleString("ru-RU")} шт.`, "получено всего")}
${tile(`${w.soldSite.toLocaleString("ru-RU")} шт.`, "продано на сайте")}
${tile(`${w.soldOffsite.toLocaleString("ru-RU")} шт.`, "продано вне сайта")}
</div>
<p class="formula">В наличии = получено − продано на сайте − продано вне сайта. Подарочный набор считается за один мел.</p>`
    : `<p class="dim">Склад пока не ведётся. Добавьте первую запись «сколько было получено» и укажите, сколько продано вне сайта, — страница начнёт считать наличие.</p>`
}
<div class="box"><h3>Добавить поступление</h3>
<form method="post">${hid}<input type="hidden" name="action" value="batch_add">
<label>Дата<input type="date" name="date" value="${esc(today)}" required></label>
<label>Количество, шт.<input type="number" name="qty" value="100" step="1" required></label>
<label>Заметка<input class="wide" name="note" maxlength="200" placeholder="например, партия № 3"></label>
<button type="submit">Добавить</button></form>
<p class="formula">Ошиблись или нужно списать брак — добавьте запись с минусом (например, −3) или удалите строку ниже.</p></div>
<div class="box"><h3>Продажи вне сайта и предупреждение</h3>
<form method="post">${hid}<input type="hidden" name="action" value="wh_save">
<label>Продано вне сайта, шт. (всего)<input type="number" name="offsite" value="${w.soldOffsite}" min="0" step="1" required></label>
<label>Написать, когда останется, шт.<input type="number" name="threshold" value="${w.threshold}" min="0" step="1" required></label>
<label>На почту<input class="wide" type="email" name="email" value="${esc(w.email)}" required></label>
<button type="submit">Сохранить</button></form>
<form method="post" style="margin-top:8px">${hid}<input type="hidden" name="action" value="wh_test"><button class="alt" type="submit">Отправить проверочное письмо</button></form>
<p class="formula">${
    mailEnabled()
      ? "Сайт проверяет наличие раз в 30 минут и после каждого изменения здесь. Письмо приходит один раз, когда остаток опускается до порога, и ещё раз — когда товар закончился. После новой партии предупреждение включается снова."
      : "<b>Письма на сервере не настроены (SMTP_USER / SMTP_PASSWORD)</b> — предупреждение на почту не придёт."
  }</p></div>
${
  rows.length
    ? `<div class="wrap"><table><thead><tr><th>Поступления</th><th>Шт.</th><th></th></tr></thead><tbody>${rows.join("\n")}</tbody><tfoot><tr><td>Получено всего</td><td>${w.received}</td><td></td></tr></tfoot></table></div>`
    : ""
}`;
}

async function render(token: string, q: URLSearchParams): Promise<Response> {
  if (!dbEnabled())
    return page(`<h1>Продажи</h1><p class="msg">Отчёт считается по базе данных заказов, а она не подключена (переменная DATABASE_URL).</p>`);
  const sales = await loadSales();
  const wh = await warehouse();
  const message = MESSAGES[q.get("msg") ?? ""] ?? (q.get("err") ? { ok: false, text: q.get("err")!.slice(0, 300) } : null);
  const now = Date.now();
  const base = `?token=${esc(encodeURIComponent(token))}`;

  // Выбранный период: произвольные даты (обе включительно) или текущий отчётный период
  const custom = isDay(q.get("from")) && isDay(q.get("to")) && q.get("from")! <= q.get("to")!;
  const from = custom ? q.get("from")! : periodStart(now);
  const toInclusive = custom ? q.get("to")! : ymd(startOf(nextPeriod(from)) - DAY);
  const a = startOf(from);
  const b = startOf(toInclusive) + DAY;
  const chosen = sales.filter((o) => o.at >= a && o.at < b);
  const total = sum(chosen);

  // Все отчётные периоды — от первой продажи до текущего
  const byPeriod = new Map<string, Sale[]>();
  for (const o of sales) {
    const key = periodStart(o.at);
    const list = byPeriod.get(key);
    if (list) list.push(o);
    else byPeriod.set(key, [o]);
  }
  const current = periodStart(now);
  const first = sales.length ? periodStart(sales[sales.length - 1].at) : current;
  const periods: string[] = [];
  for (let p = first; p <= current; p = nextPeriod(p)) periods.push(p);
  periods.reverse();
  const cells = (s: Sum) =>
    `<td>${s.chalk + s.kits}</td><td>${s.chalk}</td><td>${s.kits}</td><td>${s.orders}</td><td>${esc(rub(s.goods))}</td><td>${esc(rub(s.total))}</td>`;
  const periodRows = periods.map((p) => {
    const end = ymd(startOf(nextPeriod(p)) - DAY);
    const s = sum(byPeriod.get(p) ?? []);
    const open = p === current ? " <span class=\"dim\">· идёт сейчас</span>" : "";
    return `<tr class="${!custom && p === from ? "cur" : custom && p === from && end === toInclusive ? "cur" : ""}"><td><a href="${base}&from=${p}&to=${end}">${esc(human(p))} – ${esc(human(end))}</a>${open}</td>${cells(s)}</tr>`;
  });

  const when = (t: number) =>
    new Date(t).toLocaleString("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const orderRows = chosen.map(
    (o) =>
      `<tr><td>${esc(o.id)} <span class="dim">· ${esc(when(o.at))}${o.abroad ? " · из-за рубежа" : ""}</span><br><span class="dim">${esc(o.name)}</span></td><td>${o.kit ? "набор" : "мел"} × ${o.qty}</td><td>${esc(rub(o.goods))}</td><td>${esc(rub(o.delivery))}</td><td>${esc(rub(o.total))}</td></tr>`,
  );

  return page(`<h1>Продажи</h1>
<p class="lead">Отчётный период — с ${START_DAY}-го по ${START_DAY}-е число (${START_DAY}-е уже относится к новому периоду). Считаются оплаченные заказы по дате оплаты, время московское.</p>
${message ? `<p class="msg${message.ok ? " ok" : ""}">${esc(message.text)}</p>` : ""}
${stockSection(token, wh, ymd(now))}
<h2>Продажи за период</h2>
<form method="get">
<input type="hidden" name="token" value="${esc(token)}">
<label>С (включительно)<input type="date" name="from" value="${esc(from)}" required></label>
<label>По (включительно)<input type="date" name="to" value="${esc(toInclusive)}" required></label>
<button type="submit">Показать</button>
${custom ? `<a href="${base}">текущий период</a>` : ""}
</form>
<h2>${esc(human(from))} – ${esc(human(toInclusive))}${!custom ? ' <span class="dim">· текущий период</span>' : ""}</h2>
${tiles(total)}
<h2>По периодам</h2>
<div class="wrap"><table>
<thead><tr><th>Период</th><th>Продано, шт.</th><th>Мел</th><th>Наборы</th><th>Заказов</th><th>За товар</th><th>Получено всего</th></tr></thead>
<tbody>${periodRows.join("\n")}</tbody>
<tfoot><tr><td>За всё время</td>${cells(sum(sales))}</tr></tfoot>
</table></div>
<h2>Заказы за ${esc(human(from))} – ${esc(human(toInclusive))} · ${chosen.length}</h2>
${
  chosen.length
    ? `<div class="wrap"><table><thead><tr><th>Заказ</th><th>Товар</th><th>За товар</th><th>Доставка</th><th>Всего</th></tr></thead><tbody>${orderRows.join("\n")}</tbody></table></div>`
    : `<p class="dim">За этот период оплаченных заказов нет.</p>`
}
<nav><a href="/cdek-orders${base}">← Накладные СДЭК</a> · В отчёт попадают заказы сайта из базы данных; продажи вне сайта (SOLD_COUNT) здесь не учитываются.</nav>`);
}

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const token = q.get("token");
  if (!authorized(token)) return new Response("Not found", { status: 404, headers: { "X-Robots-Tag": "noindex" } });
  return render(token!, q).catch((err) => {
    console.error("[sales]", err);
    return page(`<h1>Продажи</h1><p class="msg">Отчёт не открылся: ${esc(String((err as Error)?.message ?? err).slice(0, 400))}</p>`);
  });
}

/** Изменения на складе. После действия — переход обратно на страницу (обновление страницы не повторит действие). */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const token = String(form?.get("token") ?? "");
  if (!authorized(token)) return new Response("Not found", { status: 404, headers: { "X-Robots-Tag": "noindex" } });
  const back = (key: "msg" | "err", value: string) =>
    new Response(null, {
      status: 303,
      headers: { Location: `/sales?token=${encodeURIComponent(token)}&${key}=${encodeURIComponent(value)}`, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
    });
  if (!dbEnabled()) return back("err", "База данных не подключена.");
  const act = String(form?.get("action") ?? "");
  const whole = (name: string) => {
    const v = String(form?.get(name) ?? "").trim();
    return /^-?\d{1,6}$/.test(v) ? Number(v) : NaN;
  };
  try {
    if (act === "batch_add") {
      const date = String(form?.get("date") ?? "");
      const qty = whole("qty");
      if (!isDay(date)) return back("msg", "baddate");
      if (!Number.isInteger(qty) || qty === 0) return back("msg", "badqty");
      await addBatch(date, qty, String(form?.get("note") ?? "").trim());
    } else if (act === "batch_del") {
      await deleteBatch(whole("id"));
    } else if (act === "wh_save") {
      const soldOffsite = whole("offsite");
      const threshold = whole("threshold");
      const email = String(form?.get("email") ?? "").trim();
      if (!(soldOffsite >= 0) || !(threshold >= 0)) return back("msg", "badnum");
      if (!validEmail(email)) return back("msg", "badmail");
      await saveWarehouseSettings({ soldOffsite, threshold, email });
    } else if (act === "wh_test") {
      await sendStockMail(await warehouse(), false);
      return back("msg", "mailed");
    } else return back("err", "Неизвестное действие.");
    // Наличие изменилось — сразу проверяем, не пора ли предупредить
    const alert = await checkLowStock().catch((err) => {
      console.error("[warehouse]", (err as Error).message);
      return "none" as const;
    });
    return back("msg", alert === "sent" ? "alerted" : act === "batch_add" ? "batch" : act === "batch_del" ? "deleted" : "saved");
  } catch (err) {
    console.error("[sales]", err);
    return back("err", `Не получилось: ${String((err as Error).message).slice(0, 200)}`);
  }
}
