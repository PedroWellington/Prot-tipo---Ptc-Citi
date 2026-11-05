"use client";

import { useEffect } from "react";

const SKIP_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

/**
 * Liga a cena de abertura (scene.tsx):
 * - pula a animação de entrada na primeira interação (e a encerra em 1 s de qualquer jeito);
 * - um IntersectionObserver nos marcadores escolhe o quadro ativo (.is-on) e os já vistos (.is-past);
 * - will-change só enquanto o palco está na tela;
 * - onde não há animation-timeline, UM requestAnimationFrame lê a rolagem (listener passivo) e escreve só --p.
 */
export function SceneDriver() {
  useEffect(() => {
    const root = document.documentElement;
    const scene = document.querySelector<HTMLElement>("[data-scene]");
    const skip = () => root.classList.remove("scene-intro", "scene-intro-short");
    const timer = setTimeout(skip, 1000);
    for (const e of SKIP_EVENTS) addEventListener(e, skip, { passive: true, once: true });
    const cleanup: (() => void)[] = [() => clearTimeout(timer), () => SKIP_EVENTS.forEach((e) => removeEventListener(e, skip))];

    if (scene && root.classList.contains("motion-ok")) {
      const sticky = scene.querySelector<HTMLElement>(".scene-sticky")!;
      const frames = [...scene.querySelectorAll<HTMLElement>(".scene-frame")];
      const show = (k: number) => frames.forEach((f, i) => {
        f.classList.toggle("is-on", i === k);
        f.classList.toggle("is-past", i < k);
      });
      const steps = new IntersectionObserver((entries) => {
        for (const e of entries) if (e.isIntersecting) show(Number((e.target as HTMLElement).dataset.sceneStep));
      }, { rootMargin: "-50% 0px -50% 0px" });
      scene.querySelectorAll("[data-scene-step]").forEach((el) => steps.observe(el));
      const live = new IntersectionObserver(([e]) => scene.classList.toggle("is-live", e.isIntersecting));
      live.observe(scene);
      cleanup.push(() => steps.disconnect(), () => live.disconnect());

      if (!CSS.supports("animation-timeline: view()")) {
        let frame = 0;
        const update = () => {
          frame = 0;
          const r = scene.getBoundingClientRect();
          const range = r.height - innerHeight;
          sticky.style.setProperty("--p", (range > 0 ? Math.min(1, Math.max(0, -r.top / range)) : 0).toFixed(4));
        };
        const onScroll = () => { frame ||= requestAnimationFrame(update); };
        addEventListener("scroll", onScroll, { passive: true });
        addEventListener("resize", onScroll, { passive: true });
        update();
        cleanup.push(() => {
          removeEventListener("scroll", onScroll);
          removeEventListener("resize", onScroll);
          cancelAnimationFrame(frame);
        });
      }
    }
    return () => cleanup.forEach((fn) => fn());
  }, []);
  return null;
}
