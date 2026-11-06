"use client";

import { useEffect, useState } from "react";

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

/** Duração da contagem dos indicadores. */
export const COUNT_MS = 800;
export const easeOutCubic = (p: number) => 1 - (1 - p) ** 3;

// Número em pt-BR: "10.897", "21,6", "7". O ponto é sempre milhar; a vírgula, decimal.
const NUM = /\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/g;
type Num = { v: number; d: number; group: boolean };
const parse = (s: string): Num[] =>
  [...s.matchAll(NUM)].map(([m]) => ({ v: Number(m.replace(/\./g, "").replace(",", ".")), d: m.split(",")[1]?.length ?? 0, group: m.includes(".") }));
const fmt = (n: number, d: number, group: boolean) => {
  const [i, f] = n.toFixed(d).split(".");
  const int = group ? i.replace(/\B(?=(\d{3})+(?!\d))/g, ".") : i;
  return f ? `${int},${f}` : int;
};

/**
 * Texto de um indicador no meio da contagem: cada número de `to` ("R$ 10.897", "21,6%", "8/12", "7 dias") vai do
 * número na mesma posição de `from` (ou de 0) até o seu valor, com as mesmas casas decimais e o milhar com ponto.
 * Em t ≥ 1 devolve `to` exatamente como veio.
 */
export function countText(from: string, to: string, t: number): string {
  if (t >= 1) return to;
  const a = parse(from), b = parse(to);
  let k = 0;
  return to.replace(NUM, () => {
    const target = b[k], start = a[k]?.v ?? 0;
    k++;
    return fmt(start + (target.v - start) * Math.max(0, t), target.d, target.group || !!a[k - 1]?.group);
  });
}
