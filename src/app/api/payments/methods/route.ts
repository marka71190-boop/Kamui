/** GET /api/payments/methods — способы оплаты, подключённые в ЮKassa (подписи для формы заказа). */
import { features } from "@/config/features";
import { json } from "@/lib/http";
import { paymentMethodLabels } from "@/lib/payments/yookassa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!features.payments) return json({ ok: true, methods: [] });
  return json({ ok: true, methods: await paymentMethodLabels() }, 200, {
    "Cache-Control": "public, max-age=600, s-maxage=3600",
  });
}
