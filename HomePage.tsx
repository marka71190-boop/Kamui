import type { Stock } from "@/lib/stock";
import { Footer } from "./footer/Footer";
import { Header } from "./header/Header";
import { Hero } from "./hero/Hero";
import { Purchase } from "./purchase/Purchase";
import { Collection } from "./sections/Collection";
import { Features } from "./sections/Features";
import { Gallery } from "./sections/Gallery";
import { Story } from "./sections/Story";
import { Marquee } from "./ui/Marquee";
import { RevealObserver } from "./ui/RevealObserver";

export function HomePage({ stock }: { stock: Stock }) {
  return (
    <>
      <Header stock={stock} />
      <main id="main">
        <Hero stock={stock} />
        <Marquee />
        <Collection stock={stock} />
        <Features />
        <Story />
        <Gallery />
        <Purchase stock={stock} />
      </main>
      <Footer />
      <RevealObserver />
    </>
  );
}
