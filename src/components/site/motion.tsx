"use client";

import { useEffect, useLayoutEffect } from "react";

/*
 * Classes de movimento em <html>:
 *   motion-ok   há JS, IntersectionObserver e movimento permitido: as seções podem entrar animadas ao rolar;
 *   scene-live  além disso há WebGL2: a abertura vira o palco de partículas (sem ela, blocos estáticos).
 * O script inline liga as duas antes da primeira pintura. Navegando pelo próprio site (do app de volta para "/")
 * o script inline não roda de novo, então applyMotionClasses() roda também ao montar a página. Era esse o
 * "hero quebrado" depois de sair da conta: sem as classes, a cena caía no modo estático no meio do palco.
 */
const MOTION_TEST = `"IntersectionObserver"in window&&!matchMedia("(prefers-reduced-motion: reduce)").matches`;

export const MOTION_SCRIPT = `(function(){var d=document.documentElement;if(!(${MOTION_TEST}))return;d.classList.add("motion-ok");if("WebGL2RenderingContext"in window)d.classList.add("scene-live");try{if(!sessionStorage.getItem("mv-intro")){sessionStorage.setItem("mv-intro","1");d.classList.add("scene-intro")}}catch(e){}setTimeout(function(){if(!window.__siteMotion)d.classList.remove("motion-ok","scene-live")},4000)})()`;

/** Mesmo teste do script inline; devolve se o movimento está ligado. */
export function applyMotionClasses(): boolean {
  const d = document.documentElement;
  const ok = "IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion: reduce)").matches;
  d.classList.toggle("motion-ok", ok);
  d.classList.toggle("scene-live", ok && "WebGL2RenderingContext" in window);
  return ok;
}

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
  // Antes da pintura: na navegação do cliente a página chega sem as classes do script inline
  useLayoutEffect(() => {
    (window as { __siteMotion?: boolean }).__siteMotion = true;
    applyMotionClasses();
  }, []);
  useEffect(() => {
    const root = document.documentElement;
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
      // As classes de movimento ficam: valem para a próxima visita a "/" (e o Strict Mode do dev remonta o efeito)
      root.classList.remove("is-scrolled");
    };
  }, []);
  return null;
}
