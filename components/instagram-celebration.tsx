"use client";

import { memo, useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { X } from "lucide-react";
import { NetworkIcon } from "@/components/overview";
import styles from "./instagram-celebration.module.css";

// Fixed values keep the rain stable through clock ticks and data refreshes.
// Negative delays fill the screen immediately, with no empty restart between cycles.
const confetti = Array.from({ length: 112 }, (_, index) => ({
  "--left": `${((index * 73 + 19) % 112) / 1.12}%`,
  "--fall-duration": `${9 + ((index * 17) % 90) / 10}s`,
  "--fall-delay": `-${((index * 31) % 180) / 10}s`,
  "--sway-duration": `${2.4 + ((index * 7) % 24) / 10}s`,
  "--turn-duration": `${2 + ((index * 13) % 35) / 10}s`,
  "--drift": `${((index * 43) % 200) - 100}px`,
  "--paper-width": `${7 + (index % 5) * 2}px`,
  "--paper-height": `${12 + (index % 4) * 4}px`,
  "--paper-color": ["#27fb6b", "#bcffdb", "#00b9e8", "#ffffff", "#f4d774", "#00b142"][index % 6],
}) as CSSProperties);

export default memo(function InstagramCelebration({ onClose }: { onClose: () => void }) {
  const celebrationRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    celebrationRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus({ preventScroll: true });
    };
  }, []);

  return (
    <section
      ref={celebrationRef}
      className={styles.celebration}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="instagram-celebration-title"
      aria-describedby="instagram-celebration-description"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
        if (event.key === "Tab") {
          event.preventDefault();
          closeRef.current?.focus();
        }
      }}
    >
      <div className={styles.geometry} aria-hidden="true">
        <span className={styles.ring} />
        <span className={styles.quarter} />
        <span className={styles.circle} />
        <span className={styles.lines} />
      </div>

      <div className={styles.brand} aria-hidden="true">Rede Câmara</div>
      <img className={styles.logo} src="/brand/camara-idv.svg" alt="Câmara dos Deputados" />

      <div className={styles.content}>
        <span className={styles.eyebrow}>JÁ SOMOS</span>
        <h1 id="instagram-celebration-title" className={styles.number} aria-label="400 mil seguidores no Instagram">
          <span>400</span><span className={styles.unit}>MIL</span>
        </h1>
        <p className={styles.followers}>SEGUIDORES NO INSTAGRAM</p>
        <div className={styles.rule} aria-hidden="true" />
        <p id="instagram-celebration-description" className={styles.thanks}>
          Obrigado por fazer parte dessa história.
        </p>
        <div className={styles.handle}>
          <span className={styles.instagram}><NetworkIcon id="instagram" /></span>
          <span>@camaradosdeputados</span>
        </div>
      </div>

      <div className={styles.confetti} aria-hidden="true">
        {confetti.map((style, index) => (
          <span className={styles.falling} style={style} key={index}>
            <span className={styles.sway}>
              <i className={`${styles.paper} ${index % 7 === 0 ? styles.round : ""}`} />
            </span>
          </span>
        ))}
      </div>

      <button
        ref={closeRef}
        type="button"
        className={styles.close}
        onClick={onClose}
        aria-label="Voltar ao painel. Atalho: Escape."
        title="Voltar ao painel · Esc"
      >
        <X /><span>Voltar ao painel</span>
      </button>
    </section>
  );
});
