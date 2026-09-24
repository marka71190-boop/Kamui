import { HomePage } from "@/components/HomePage";
import { productJsonLd } from "@/lib/seo";
import { getStock } from "@/lib/stock";

/** Страница статическая и пересобирается раз в минуту — так остаток всегда свежий. */
export const revalidate = 60;

export default async function Page() {
  const stock = await getStock();
  const jsonLd = JSON.stringify(productJsonLd(stock)).replace(/</g, "\\u003c");

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <HomePage stock={stock} />
    </>
  );
}
