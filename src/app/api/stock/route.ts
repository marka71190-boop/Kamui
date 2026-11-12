/**
 * GET /api/stock — актуальный остаток для браузера (живые цифры на странице).
 * Ответ держится 15 секунд: в памяти сервера (свой сервер) и на CDN (Vercel),
 * чтобы таблица и ЮKassa не получали лишних запросов от каждого посетителя.
 */
import { features } from "@/config/features";
import { json } from "@/lib/http";
import { getStock } from "@/lib/stock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL_MS = 15_000;
type Payload = { ok: true; total: number; sold: number; remaining: number } | { ok: false };
let memo: { at: number; data: Payload } | null = null;
let inflight: Promise<Payload> | null = null;

async function load(): Promise<Payload> {
  const s = await getStock({ fresh: true });
  // Таблица не ответила и остались только цифры из конфига — пусть браузер оставит цифры со страницы
  if (features.googleSheets && s.source === "config") return { ok: false };
  return { ok: true, total: s.total, sold: s.sold, remaining: s.remaining };
}

export async function GET() {
  if (!memo || Date.now() - memo.at > TTL_MS) {
    // Один запрос к таблице на всех, кто пришёл одновременно
    inflight ??= load()
      .then((data) => {
        if (data.ok) memo = { at: Date.now(), data };
        return data;
      })
      .finally(() => {
        inflight = null;
      });
    const data = await inflight;
    // Таблица не ответила: отдаём последние известные цифры, а если их нет — пусть браузер оставит цифры со страницы
    if (!data.ok && !memo) return json(data, 503);
  }
  return json(memo!.data, 200, { "Cache-Control": "public, max-age=0, s-maxage=15, stale-while-revalidate=45" });
}
