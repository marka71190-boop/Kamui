"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { GALLERY } from "@/config/gallery";
import { pad2 } from "@/lib/format";
import { revealDelay } from "@/lib/style";
import { Slider } from "@/components/slider/Slider";
import { Close, Expand } from "@/components/ui/Icons";
import styles from "./Gallery.module.css";

export function Gallery() {
  const [openAt, setOpenAt] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (openAt !== null && !dialog.open) {
      dialog.showModal();
      document.documentElement.style.overflow = "hidden";
    }
    if (openAt === null && dialog.open) dialog.close();
  }, [openAt]);

  const onClose = () => {
    document.documentElement.style.overflow = "";
    setOpenAt(null);
  };

  return (
    <section id="gallery" className={`section ${styles.gallery}`} aria-labelledby="gallery-title">
      <div className="container">
        <div className={styles.head}>
          <div>
            <p className="section-label" data-reveal>
              <b>04</b> Галерея
            </p>
            <h2 id="gallery-title" className="section-title" data-reveal>
              Kamui <span className="red">×</span> Iosif Abramov
            </h2>
          </div>
          <p className={styles.hint} data-reveal>
            Нажмите на фото, чтобы открыть его во весь экран
          </p>
        </div>

        <ul className={styles.grid}>
          {GALLERY.map((photo, i) => (
            <li key={photo.caption} className={styles.item} data-reveal style={revealDelay(i * 90)}>
              <button
                type="button"
                className={styles.tile}
                onClick={() => setOpenAt(i)}
                aria-label={`Открыть фото: ${photo.caption}`}
              >
                <Image
                  src={photo.src}
                  alt={photo.alt}
                  fill
                  sizes="(max-width: 640px) 80vw, (max-width: 1100px) 50vw, 25vw"
                  placeholder="blur"
                  className={styles.img}
                />
                <span className={styles.zoom} aria-hidden="true">
                  <Expand />
                </span>
              </button>
              <p className={styles.caption}>
                <span>{pad2(i + 1)}</span>
                {photo.caption}
              </p>
            </li>
          ))}
        </ul>
      </div>

      <dialog ref={dialogRef} className={styles.dialog} onClose={onClose} aria-label="Просмотр фотографий">
        {openAt !== null && (
          <Slider
            slides={GALLERY}
            variant="lightbox"
            ariaLabel="Фотографии коллекции"
            sizes="100vw"
            initialIndex={openAt}
          />
        )}
        <button type="button" className={styles.close} onClick={() => dialogRef.current?.close()} aria-label="Закрыть">
          <Close />
        </button>
      </dialog>
    </section>
  );
}
