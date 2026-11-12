import { emailSyntaxOk, suggestEmail } from "@/lib/orders/email-check";
import { emailDomainVerdict, EMAIL_VERDICT_TEXT } from "@/lib/orders/email-dns";

export const dynamic = "force-dynamic";

/** Проверка почты прямо в форме: GET /api/email-check?email=…&lang=ru */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const email = (q.get("email") ?? "").trim().toLowerCase().slice(0, 254);
  const lang = q.get("lang") === "en" ? "en" : "ru";
  const headers = { "Cache-Control": "no-store" };
  if (!emailSyntaxOk(email)) return Response.json({ ok: false, syntax: false }, { headers });
  const verdict = await emailDomainVerdict(email);
  if (verdict !== "ok") return Response.json({ ok: false, syntax: true, problem: EMAIL_VERDICT_TEXT[lang][verdict] }, { headers });
  return Response.json({ ok: true, syntax: true, suggestion: suggestEmail(email) }, { headers });
}
