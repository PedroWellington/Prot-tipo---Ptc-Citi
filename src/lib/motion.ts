"use client";

import { useEffect, useRef, useState } from "react";

/** Tempos de saída (iguais aos do CSS em globals.css): fechar é mais rápido que abrir. */
export const PANEL_OUT_MS = 150;
export const LEAVE_MS = 180;

export const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Mantém um painel montado durante a animação de saída.
 * `present`: renderizar; `closing`: aplicar a classe de saída. Com menos movimento, some na hora.
 */
export function usePresence(open: boolean, ms = PANEL_OUT_MS) {
  const [present, setPresent] = useState(open);
  if (open && !present) setPresent(true);
  useEffect(() => {
    if (open || !present) return;
    const t = setTimeout(() => setPresent(false), reducedMotion() ? 0 : ms);
    return () => clearTimeout(t);
  }, [open, present, ms]);
  return { present, closing: present && !open };
}

/**
 * Item removido sai deslizando antes de a lista mudar: a interface responde no clique, e a atualização otimista
 * (que tira o item do cache) roda logo depois. Se a ação falhar, o cache volta e o item reaparece sem a classe.
 */
export function leave(from: EventTarget | Element | null, then: () => void) {
  const el = from instanceof Element ? from.closest("li, [data-leave]") : null;
  if (!el || reducedMotion()) return then();
  el.classList.add("is-leaving");
  setTimeout(then, LEAVE_MS);
}

/** Número que anima do valor anterior para o novo (escreve direto no DOM, sem re-render por quadro). */
export function useCountTo(value: number, ms = 400) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);
  useEffect(() => {
    const el = ref.current;
    const from = shown.current;
    shown.current = value;
    if (!el || from === value || reducedMotion()) {
      if (el) el.textContent = value.toLocaleString("pt-BR");
      return;
    }
    const start = performance.now();
    let id = 0;
    const step = (t: number) => {
      const p = Math.min((t - start) / ms, 1);
      const eased = 1 - (1 - p) ** 3;
      el.textContent = Math.round(from + (value - from) * eased).toLocaleString("pt-BR");
      if (p < 1) id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [value, ms]);
  return ref;
}
