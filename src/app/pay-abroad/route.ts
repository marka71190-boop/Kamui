/**
 * /pay-abroad — отдельная страница для проверки оплаты картой иностранного банка через Robokassa.
 * На ней кнопка оплаты счёта, созданного в личном кабинете Robokassa.
 *
 * Страница не связана с формой заказа: заказ в таблицу не записывается, накладная СДЭК не создаётся.
 * В поиск не попадает (noindex + robots.txt), ссылок на неё на сайте нет.
 *
 * Счёт можно поменять без правки кода: переменная ROBOKASSA_TEST_INVOICE = EncodedInvoiceId
 * из кода кнопки (…FormSS.js?EncodedInvoiceId=<вот это>).
 *
 * Страница отдаётся обычным HTML, а не React: скрипт кнопки Robokassa рисует её прямо при загрузке страницы.
 */
import { SITE } from "@/config/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Счёт из кода кнопки, который прислал продавец 28.09.2026 */
const DEFAULT_INVOICE = "lP8R3SmdgEap21gRnHuOEA";

function invoiceId(): string {
  const fromEnv = (process.env.ROBOKASSA_TEST_INVOICE ?? "").trim();
  return /^[A-Za-z0-9_-]{8,64}$/.test(fromEnv) ? fromEnv : DEFAULT_INVOICE;
}

const HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
};

export function GET() {
  const src = `https://auth.robokassa.ru/Merchant/PaymentForm/FormSS.js?EncodedInvoiceId=${encodeURIComponent(invoiceId())}`;
  const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Оплата картой иностранного банка · ${SITE.name}</title>
<link rel="icon" href="/icon.svg">
<style>
:root{--bg:#0b0b0c;--card:#141416;--line:#2a2a2f;--text:#f2f2f3;--muted:#a3a3ab;--dim:#75757d;--red:#e3161b}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--text)}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px 16px;
  font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}
main{width:min(520px,100%)}
.brand{margin:0 0 18px;font-size:12px;font-weight:700;letter-spacing:.24em;text-transform:uppercase;color:var(--muted)}
.brand b{color:var(--red)}
.card{background:var(--card);border:1px solid var(--line);border-top:3px solid var(--red);padding:28px clamp(18px,5vw,32px)}
h1{margin:0 0 6px;font-size:26px;line-height:1.2}
.en{margin:0 0 20px;color:var(--muted);font-size:15px}
ol{margin:0 0 22px;padding-left:20px;color:var(--muted)}
ol li{margin:0 0 8px}
ol li span{display:block;color:var(--dim);font-size:14px}
.pay{display:flex;justify-content:center;padding:18px 0 6px;min-height:72px}
.note{margin:18px 0 0;padding-top:16px;border-top:1px solid var(--line);color:var(--dim);font-size:13px}
.note p{margin:0 0 6px}
a{color:var(--text)}
.back{display:inline-block;margin-top:18px;color:var(--muted);font-size:14px}
</style>
</head>
<body>
<main>
<p class="brand">Kamui <b>×</b> Iosif Abramov</p>
<div class="card">
  <h1>Оплата картой иностранного банка</h1>
  <p class="en">Payment with a card issued outside Russia</p>
  <ol>
    <li>Нажмите кнопку ниже — откроется защищённая страница Robokassa.
      <span>Press the button below — the secure Robokassa page will open.</span></li>
    <li>Выберите оплату картой и введите её данные — подходят Visa, Mastercard и UnionPay зарубежных банков.
      <span>Choose card payment and enter your card details — Visa, Mastercard and UnionPay cards issued abroad are accepted.</span></li>
    <li>Сумма спишется в валюте вашей карты по курсу вашего банка.
      <span>The amount is charged in your card's currency at your bank's rate.</span></li>
  </ol>
  <div class="pay">
    <script type="text/javascript" src="${src}"></script>
    <noscript>Включите JavaScript, чтобы увидеть кнопку оплаты · Please enable JavaScript to see the payment button</noscript>
  </div>
  <div class="note">
    <p>Данные карты вводятся только на странице Robokassa и продавцу не передаются.</p>
    <p>Card details are entered on the Robokassa page only and are not shared with the seller.</p>
    <p>Если кнопка не появилась, обновите страницу · If the button did not appear, reload the page.</p>
  </div>
</div>
<a class="back" href="/">← ${SITE.domain}</a>
</main>
</body>
</html>`;
  return new Response(html, { status: 200, headers: HEADERS });
}
