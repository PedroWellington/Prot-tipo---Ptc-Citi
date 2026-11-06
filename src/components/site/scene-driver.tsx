"use client";

import { useEffect, useLayoutEffect } from "react";
import { applyMotionClasses } from "./motion";
import { FIRST_SHAPE, frameAt, timeline } from "./scene-timeline";
import type { Stage, StageOptions } from "./particle-stage";

const SKIP_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
const PALETTE = ["--particle-1", "--particle-2", "--particle-3", "--particle-4"] as const;

const palette = (): StageOptions["palette"] => {
  const cs = getComputedStyle(document.documentElement);
  // Sem o token, o motor usa o turquesa da paleta (hex() em particle-stage.ts)
  return PALETTE.map((v) => cs.getPropertyValue(v).trim()) as StageOptions["palette"];
};

/**
 * Liga a abertura a cada visita a "/" (monta e desmonta junto com a página, inclusive na navegação do cliente):
 * - ao entrar, zera o progresso e volta ao topo (a não ser que a URL tenha âncora);
 * - UM listener de rolagem passivo grava só o progresso-alvo; um requestAnimationFrame troca o quadro de texto
 *   e escreve --p (uma variável) no palco; o motor de partículas suaviza o próprio progresso;
 * - o motor (particle-stage.ts) só é baixado depois da primeira pintura, quando o navegador fica ocioso;
 * - se não houver como desenhar, tira .scene-live e a cena vira os blocos estáticos.
 */
export function SceneDriver() {
  // Antes da pintura, para não piscar o modo estático na navegação do cliente
  useLayoutEffect(() => {
    applyMotionClasses();
    if (!location.hash) {
      history.scrollRestoration = "manual";
      scrollTo(0, 0);
    }
    return () => { history.scrollRestoration = "auto"; };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const scene = document.querySelector<HTMLElement>("[data-scene]");
    if (!scene || !root.classList.contains("scene-live")) return;
    const sticky = scene.querySelector<HTMLElement>(".scene-sticky")!;
    const canvas = scene.querySelector<HTMLCanvasElement>("[data-scene-canvas]")!;
    const frames = [...scene.querySelectorAll<HTMLElement>(".scene-frame")];
    const heroText = scene.querySelector<HTMLElement>(".scene-hero-text");
    const copies = [...scene.querySelectorAll<HTMLElement>(".scene-phrase .scene-copy")];
    const header = document.querySelector<HTMLElement>(".site-header");
    // Área útil do celular, medida de verdade (px do palco): do fim do cabeçalho até o começo de cada bloco de texto
    const layout = () => {
      const base = sticky.getBoundingClientRect().top;
      const top = Math.max(0, (header?.getBoundingClientRect().bottom ?? 64) - base);
      const rel = (el: Element | null | undefined, fb: number) => (el ? el.getBoundingClientRect().top - base : fb);
      const h = sticky.clientHeight;
      return { top, heroTop: rel(heroText, h * 0.55), copyTops: copies.map((c) => rel(c, h * 0.7)), bottom: h - 24 };
    };
    // Texto mudou de tamanho (fonte chegou, rotação, frase editada): refaz o enquadramento das formas
    const textRo = new ResizeObserver(() => stage?.relayout());
    [heroText, ...copies].forEach((el) => el && textRo.observe(el));
    let alive = true;
    let stage: Stage | null = null;

    // Quadros: o ativo ganha .is-on; os já vistos, .is-past (saem pelo lado contrário). Na nuvem entre duas formas
    // nenhum está ativo, e os quadros até o segmento atual continuam "passados"
    let shown = "0:0";
    const show = (k: number, pastBefore: number) => {
      const key = `${k}:${pastBefore}`;
      if (key === shown) return;
      shown = key;
      frames.forEach((f, i) => { f.classList.toggle("is-on", i === k); f.classList.toggle("is-past", i < pastBefore && i !== k); });
    };

    // Medidas da seção: só no resize, nunca durante a rolagem
    let top = 0, range = 1;
    const measure = () => {
      const r = scene.getBoundingClientRect();
      top = r.top + scrollY;
      range = Math.max(1, r.height - innerHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(scene);

    let target = 0, frame = 0;
    // Aviso "Role para ver": some depois de ~40 px e volta no topo
    const hint = scene.querySelector<HTMLAnchorElement>("[data-scene-hint]");
    let hintOn = true;
    const update = () => {
      frame = 0;
      const on = scrollY <= 40;
      if (on !== hintOn) {
        hintOn = on;
        scene.dataset.hint = on ? "on" : "off";
        if (hint) hint.inert = !on;
      }
      const k = frameAt(target);
      show(k, k === -1 ? timeline(target).seg + 1 : k);
      stage?.setProgress(target);
    };
    const onScroll = () => {
      target = Math.min(1, Math.max(0, (scrollY - top) / range));
      frame ||= requestAnimationFrame(update);
    };
    addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    // Clicar no aviso rola suave até a primeira forma montada (no meio do primeiro quadro de frase)
    const toFirstShape = (e: MouseEvent) => {
      e.preventDefault();
      scrollTo({ top: top + range * FIRST_SHAPE, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    };
    hint?.addEventListener("click", toFirstShape);

    // Abertura (primeira visita da sessão): as partículas se juntam no "M"; qualquer interação pula
    const skip = () => { root.classList.remove("scene-intro"); stage?.skipIntro(); };
    for (const e of SKIP_EVENTS) addEventListener(e, skip, { passive: true, once: true });

    // Tema trocado: novas cores sem recriar nada
    const themeObs = new MutationObserver(() => stage?.setPalette(palette()));
    themeObs.observe(root, { attributes: true, attributeFilter: ["data-theme"] });

    // Depois da primeira pintura e com o navegador ocioso: baixa o motor e os pontos
    const boot = async () => {
      try {
        const { startParticleStage } = await import("./particle-stage");
        if (!alive) return;
        const mobile = matchMedia("(max-width: 767px), (orientation: portrait)").matches;
        const s = await startParticleStage(canvas, {
          mobile, intro: root.classList.contains("scene-intro"), palette: palette(),
          pointer: matchMedia("(hover: hover) and (pointer: fine)").matches,
          layout,
        });
        if (!alive) { s?.destroy(); return; }
        if (!s) throw new Error("sem canvas");
        stage = s;
        stage.setProgress(target);
        scene.classList.add("is-ready");
        scene.dataset.stage = s.kind;
      } catch {
        if (alive) root.classList.remove("scene-live");
      }
    };
    const idle = globalThis.requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 200));
    const idleId = idle(() => void boot(), { timeout: 1500 } as IdleRequestOptions);

    return () => {
      alive = false;
      (globalThis.cancelIdleCallback ?? clearTimeout)(idleId as number);
      cancelAnimationFrame(frame);
      removeEventListener("scroll", onScroll);
      hint?.removeEventListener("click", toFirstShape);
      SKIP_EVENTS.forEach((e) => removeEventListener(e, skip));
      ro.disconnect();
      textRo.disconnect();
      themeObs.disconnect();
      stage?.destroy();
      stage = null;
      scene.classList.remove("is-ready");
    };
  }, []);
  return null;
}
