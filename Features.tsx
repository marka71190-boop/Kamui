import type { ReactNode } from "react";
import { revealDelay } from "@/lib/style";
import { IconClean, IconCollection, IconControl } from "@/components/ui/Icons";
import styles from "./Features.module.css";

interface Feature {
  icon: ReactNode;
  title: string;
  body: ReactNode;
}

const FEATURES: Feature[] = [
  {
    icon: <IconControl />,
    title: "Контроль",
    body: <p>Стабильное сцепление кия с наклейкой и уверенность в каждом ударе.</p>,
  },
  {
    icon: <IconClean />,
    title: "Чистота игры",
    body: (
      <>
        <p>Мы решили одну из главных проблем обычного мела:</p>
        <ul>
          <li>меньше следов на столе;</li>
          <li>меньше загрязнения кия;</li>
          <li>более аккуратное использование.</li>
        </ul>
      </>
    ),
  },
  {
    icon: <IconCollection />,
    title: "Коллекция",
    body: <p>Каждый мел является частью ограниченного выпуска Kamui × Iosif Abramov.</p>,
  },
];

export function Features() {
  return (
    <section id="features" className={`section ${styles.features}`} aria-labelledby="features-title">
      <div className="container">
        <div className={styles.head}>
          <p className="section-label" data-reveal>
            <b>02</b> Преимущества
          </p>
          <h2 id="features-title" className="section-title" data-reveal>
            Точность <span className="red">в деталях</span>
          </h2>
        </div>

        <div className={styles.cards}>
          {FEATURES.map((f, i) => (
            <article key={f.title} className={styles.card} data-reveal style={revealDelay(i * 110)}>
              <div className={styles.cardTop}>
                <span className={styles.icon}>{f.icon}</span>
                <span className={styles.index}>0{i + 1}</span>
              </div>
              <h3 className={styles.cardTitle}>{f.title}</h3>
              <div className={styles.cardBody}>{f.body}</div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
