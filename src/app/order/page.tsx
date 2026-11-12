import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";
import { OrderLookup } from "@/components/order/OrderLookup";
import { SELLER, telegramUrl } from "@/config/site";
import { ORDER_ID_RE } from "@/lib/orders/id";

export const metadata: Metadata = {
  title: "Где мой заказ",
  description: "Статус заказа и трек-номер СДЭК по номеру заказа.",
  alternates: { canonical: "/order" },
  robots: { index: false, follow: true },
};

/** /order[?id=KA-260925-AB12][&lang=en] — статус заказа для покупателя */
export default async function OrderPage({ searchParams }: { searchParams: Promise<{ id?: string; lang?: string }> }) {
  const q = await searchParams;
  const id = String(q.id ?? "").toUpperCase();
  const lang = q.lang === "en" ? "en" : "ru";
  return (
    <LegalPage title={lang === "en" ? "Track your order" : "Где мой заказ"}>
      <OrderLookup
        initialId={ORDER_ID_RE.test(id) ? id : ""}
        lang={lang}
        telegram={SELLER.telegram ? { name: SELLER.telegram, url: telegramUrl() } : undefined}
        email={SELLER.email}
      />
    </LegalPage>
  );
}
