"use client";

import { useEffect } from "react";

/**
 * Roda antes da primeira pintura (script inline no topo da página): só esconde o que vai entrar ao rolar
 * quando há JavaScript, IntersectionObserver e movimento permitido. Se o observer não subir em 4 s, mostra tudo.
 * Na primeira visita da sessão liga a abertura da esfera (curta se a página demorou a chegar).
 */
export const MOTION_SCRIPT = `(function(){var d=document.documentElement;if(!("IntersectionObserver"in window)||matchMedia("(prefers-reduced-motion: reduce)").matches)return;d.classList.add("motion-ok");try{if(!sessionStorage.getItem("mv-intro")){sessionStorage.setItem("mv-intro","1");d.classList.add(performance.now()>1200?"scene-intro-short":"scene-intro")}}catch(e){}setTimeout(function(){if(!window.__siteMotion)d.classList.remove("motion-ok")},4000)})()`;

const COUNT_MS = 1000;

function countUp(el: HTMLElement) {
  const target = Number(el.dataset.count);
  if (!Number.isFinite(target) || target <= 0) return;
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / COUNT_MS);
    el.textContent = String(Math.round(target * (1 - (1 - t) ** 3)));
    if (t < 1) requestAnimationFrame(step);
  };
  el.textContent = "0";
  requestAnimationFrame(step);
}

/**
 * Um único IntersectionObserver para a página inteira:
 * [data-reveal] e .steps-line entram uma vez; [data-count] conta de 0 até o valor; .marquee só roda visível;
 * [data-top-sentinel] liga o cabeçalho compacto. Nenhum listener de rolagem.
 */
export function SiteMotion() {
  useEffect(() => {
    const root = document.documentElement;
    (window as { __siteMotion?: boolean }).__siteMotion = true;
    const motion = root.classList.contains("motion-ok");
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const el = e.target as HTMLElement;
        if (el.hasAttribute("data-top-sentinel")) { root.classList.toggle("is-scrolled", !e.isIntersecting); continue; }
        if (el.classList.contains("marquee")) { el.classList.toggle("is-running", e.isIntersecting); continue; }
        if (!e.isIntersecting) continue;
        el.classList.add("is-in");
        if (motion) el.querySelectorAll<HTMLElement>("[data-count]").forEach(countUp);
        io.unobserve(el);
      }
    }, // Threshold baixo e margem positiva: o bloco começa a subir logo que encosta na borda da tela
    { threshold: 0.06, rootMargin: "0px 0px 60px 0px" });
    document.querySelectorAll("[data-reveal], .steps-line, .marquee, [data-top-sentinel], [data-count-group]").forEach((el) => io.observe(el));
    return () => {
      io.disconnect();
      // motion-ok fica: o script inline não roda de novo ao voltar para "/" pela navegação do cliente
      // (e o Strict Mode do dev desmonta e remonta o efeito)
      root.classList.remove("is-scrolled");
    };
  }, []);
  return null;
}
