/**
 * GET /pay-check?token=<PAYMENTS_TEST_TOKEN> — служебная проверка подключения ЮKassa.
 * Показывает, приняты ли ключи, боевой ли магазин, подключены ли чеки, адрес для уведомлений
 * и из чего складывается остаток на сайте.
 * Без правильного токена отвечает 404. Платежей не создаёт.
 */
import { features } from "@/config/features";
import { json } from "@/lib/http";
import { getRobokassaState, robokassaConfig } from "@/lib/payments/robokassa";
import { getShopInfo, paidQuantity, shouldSendReceipt, siteOriginFor } from "@/lib/payments/yookassa";
import { probeSheetStock } from "@/lib/orders/stores/google-sheets";
import { getStock, stockDiagnostics } from "@/lib/stock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noindex = { "X-Robots-Tag": "noindex, nofollow" };

export async function GET(request: Request) {
  const token = process.env.PAYMENTS_TEST_TOKEN ?? "";
  const given = new URL(request.url).searchParams.get("token") ?? "";
  if (token.length < 8 || given !== token) return json({ ok: false }, 404, noindex);

  const probe = new URL(request.url).searchParams.get("probe") === "1";
  const origin = siteOriginFor(request);
  const [stockNow, stockOnPage, paid, sheetProbe, robokassa] = await Promise.all([
    getStock({ fresh: true }).catch((err: Error) => ({ error: err.message })),
    getStock().catch((err: Error) => ({ error: err.message })),
    features.payments ? paidQuantity({ fresh: true }).catch((err: Error) => ({ error: err.message })) : null,
    probe && features.googleSheets ? probeSheetStock().catch((err: Error) => ({ error: err.message })) : null,
    robokassaCheck(origin),
  ]);
  const base = {
    stock: { now: stockNow, cached: stockOnPage, paidOnline: paid, ...stockDiagnostics(), ...(sheetProbe ? { sheetProbe } : {}) },
    paymentsEnabled: features.payments,
    onlyBySecretLink: features.paymentsTestShop,
    cdek: features.cdek,
    cdekCountries: features.cdek ? features.cdekCountries : ["RU"],
    webhookUrl: `${origin}/api/payments/yookassa/webhook`,
    robokassa,
  };
  if (!features.payments) return json({ ok: true, ...base, shop: null }, 200, noindex);
  try {
    const me = await getShopInfo({ fresh: true });
    return json(
      {
        ok: true,
        ...base,
        shop: {
          accountId: me.account_id,
          test: me.test,
          status: me.status,
          fiscalization: me.fiscalization ?? { enabled: me.fiscalization_enabled },
          paymentMethods: me.payment_methods,
        },
        receiptsSent: await shouldSendReceipt(),
      },
      200,
      noindex,
    );
  } catch (err) {
    return json({ ok: false, ...base, error: String((err as Error).message).slice(0, 300) }, 502, noindex);
  }
}

/**
 * Robokassa: подключена ли и верны ли логин, пароль №2 и алгоритм подписи.
 * Проверка — запрос статуса несуществующего счёта №1: «операция не найдена» (код 3) значит, что ключи приняты.
 */
async function robokassaCheck(origin: string) {
  const cfg = robokassaConfig();
  const urls = {
    resultUrl: `${origin}/api/payments/robokassa/result (POST)`,
    successUrl: `${origin}/api/payments/robokassa/success (GET)`,
    failUrl: `${origin}/api/payments/robokassa/fail (GET)`,
  };
  if (!cfg) return { configured: false, ...urls };
  const base = { configured: true, enabled: features.robokassa, login: cfg.login, hash: cfg.hash, test: cfg.test, receipt: cfg.receipt, ...urls };
  try {
    const st = await getRobokassaState(1, cfg);
    if (!st.found && st.resultCode === 3) return { ...base, keys: "ok" };
    if (!st.found && st.resultCode === 1)
      return { ...base, keys: "неверная подпись: проверьте ROBOKASSA_PASSWORD2 и ROBOKASSA_HASH (алгоритм в технических настройках)" };
    if (!st.found && st.resultCode === 2) return { ...base, keys: "магазин не найден: проверьте ROBOKASSA_LOGIN" };
    return { ...base, keys: st.found ? "ok" : `ответ Robokassa: код ${st.resultCode}${st.error ? ` — ${st.error}` : ""}` };
  } catch (err) {
    return { ...base, keys: `не удалось связаться с Robokassa: ${String((err as Error).message).slice(0, 200)}` };
  }
}
