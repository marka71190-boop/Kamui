import { ORDER_ID_RE } from "@/lib/orders/id";
import { readParams, unpackShipmentMeta } from "@/lib/payments/robokassa";
import { siteOriginFor } from "@/lib/payments/yookassa";

/**
 * Возврат покупателя с Robokassa → /?order=KA-…&payment=rk-<счёт>#buy.
 * Номер заказа берём из Shp_order (или из Shp_data); подпись здесь не нужна —
 * статус оплаты страница заказа всё равно спрашивает у Robokassa.
 */
export async function orderReturnRedirect(request: Request): Promise<Response> {
  const p = await readParams(request);
  const inv = p.InvId ?? p.inv_id ?? "";
  const orderId = p.Shp_order ?? p.shp_order ?? (p.Shp_data ? unpackShipmentMeta(p.Shp_data)?.orderId : "") ?? "";
  const origin = siteOriginFor(request);
  const q = new URLSearchParams();
  if (ORDER_ID_RE.test(orderId)) q.set("order", orderId);
  if (/^\d{1,19}$/.test(inv) && q.has("order")) q.set("payment", `rk-${inv}`);
  const qs = q.toString();
  const url = `${origin}/${qs ? `?${qs}` : ""}#buy`;
  return new Response(null, { status: 303, headers: { Location: url, "Cache-Control": "no-store" } });
}
