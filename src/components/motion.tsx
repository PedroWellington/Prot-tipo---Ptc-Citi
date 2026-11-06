"use client";

/**
 * Linguagem de movimento da área logada (o CSS que a acompanha está em globals.css, "Linguagem de movimento"):
 * - CountUp: indicadores contam do valor anterior (ou de 0 ao abrir a tela) até o novo;
 * - PillIndicator: um único destaque que desliza entre as opções de abas e filtros em pílula;
 * - useGrowFrom: barras de gráfico crescem do valor anterior para o novo quando um filtro muda;
 * - Greeting: saudação viva no início de cada perfil.
 * Só transform e opacity; com menos movimento, tudo aparece no valor final na hora.
 */
import { createContext, use, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { COUNT_MS, countText, easeOutCubic, reducedMotion } from "@/lib/motion";
import { entryActive, whenRevealed } from "./entry-transition";

const noop = () => () => {};
/** false enquanto o React hidrata o HTML do servidor; true quando o componente nasce no navegador. */
const useBornOnClient = () => useSyncExternalStore(noop, () => true, () => false);

/**
 * Número de indicador que conta até o valor (string já formatada em pt-BR ou número).
 * O HTML do servidor e o texto para leitores de tela trazem sempre o valor final; os passos são só visuais.
 * Nasceu na hidratação (o valor já estava pintado): não volta a 0, a não ser que o véu da entrada esteja cobrindo.
 */
export function CountUp({ value, className }: { value: string | number; className?: string }) {
  const text = typeof value === "number" ? value.toLocaleString("pt-BR") : value;
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef<string | null>(null);
  const born = useBornOnClient();
  const fromZero = useRef(born || entryActive());
  // O React escreve só o primeiro valor; depois o texto é do efeito (não disputam o mesmo nó)
  const [first] = useState(text);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = shown.current ?? (fromZero.current ? "" : text);
    shown.current = text;
    if (from === text || reducedMotion()) { el.textContent = text; return; }
    el.textContent = countText(from, text, 0);
    let id = 0, alive = true;
    void whenRevealed().then(() => {
      if (!alive) return;
      const start = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - start) / COUNT_MS);
        el.textContent = countText(from, text, easeOutCubic(p));
        if (p < 1) id = requestAnimationFrame(step);
      };
      id = requestAnimationFrame(step);
    });
    // Interrompida por um valor novo: a próxima contagem parte do que está na tela
    return () => { alive = false; cancelAnimationFrame(id); shown.current = el.textContent ?? text; };
  }, [text]);
  return (
    <span className={className}>
      <span ref={ref} aria-hidden className="tabular-nums">{first}</span>
      <span className="sr-only">{text}</span>
    </span>
  );
}

// O mesmo tempo do indicador do menu (--dur-slide em globals.css)
const SLIDE_MS = 250;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/**
 * Destaque único de um grupo em pílula (role="radio" ou role="tab", filhos diretos do mesmo pai `.pills`).
 * Mede a opção ativa só quando ela muda (ou o grupo muda de tamanho) e desliza com transform (FLIP), sem animar
 * largura. Até medir (sem JS, ou antes da hidratação), a própria opção ativa pinta o fundo (globals.css).
 */
export function PillIndicator({ index }: { index: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const last = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const ind = ref.current, box = ind?.parentElement;
    if (!ind || !box) return;
    const place = (animate: boolean) => {
      const el = box.querySelectorAll<HTMLElement>(":scope > [role=radio], :scope > [role=tab]")[index];
      if (!el) { ind.style.opacity = "0"; return; }
      const r = { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
      if (!r.w) return;
      Object.assign(ind.style, { opacity: "1", width: `${r.w}px`, height: `${r.h}px`, transform: `translate(${r.x}px, ${r.y}px)` });
      box.dataset.pillReady = "";
      const p = last.current;
      last.current = r;
      if (!animate || !p || reducedMotion() || (p.x === r.x && p.y === r.y && p.w === r.w)) return;
      ind.animate([{ transform: `translate(${p.x}px, ${p.y}px) scale(${p.w / r.w}, ${p.h / r.h})` }, { transform: `translate(${r.x}px, ${r.y}px)` }],
        { duration: SLIDE_MS, easing: EASE });
    };
    place(true);
    // Opções que chegam depois (unidades carregadas) mudam a largura das que já estavam: remede sem animar
    const ro = new ResizeObserver(() => place(false));
    ro.observe(box);
    box.querySelectorAll(":scope > [role=radio], :scope > [role=tab]").forEach((el) => ro.observe(el));
    const mo = new MutationObserver(() => { box.querySelectorAll(":scope > [role]").forEach((el) => ro.observe(el)); place(false); });
    mo.observe(box, { childList: true });
    return () => { ro.disconnect(); mo.disconnect(); };
  }, [index]);
  return <span ref={ref} aria-hidden className="pill-ind" />;
}

/**
 * Barras (`data-bar="x"` ou `data-bar="y"` com largura/altura em % no style) crescem do valor anterior para o novo.
 * Lê só o style inline (nada de layout) e anima scale a partir da razão anterior/novo. A entrada do zero é CSS (.bar).
 */
export function useGrowFrom<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    ref.current?.querySelectorAll<HTMLElement>("[data-bar]").forEach((el) => {
      const x = el.dataset.bar === "x";
      const now = parseFloat(x ? el.style.width : el.style.height);
      const prev = el.dataset.prev === undefined ? null : parseFloat(el.dataset.prev);
      el.dataset.prev = String(now);
      if (prev === null || prev === now || !(now > 0) || reducedMotion()) return;
      const k = Math.min(prev / now, 20);
      el.animate([{ transform: x ? `scaleX(${k})` : `scaleY(${k})` }, { transform: "none" }], { duration: 600, easing: EASE });
    });
  });
  return ref;
}

/** Textos da saudação (Admin > Textos > Saudação no sistema), entregues pelo layout da área logada. */
export type GreetTexts = Record<string, string>;
export const GreetContext = createContext<{ name: string; texts: GreetTexts }>({ name: "", texts: {} });

/** Bom dia / Boa tarde / Boa noite pelo relógio de Recife. */
export function partOfDay(at: Date): "manha" | "tarde" | "noite" {
  const h = Number(at.toLocaleString("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "America/Recife" }));
  return h >= 5 && h < 12 ? "manha" : h >= 12 && h < 18 ? "tarde" : "noite";
}

/** "1 sessão", "12 sessões": contagens da frase de contexto. */
export const sessions = (n: number) => `${n.toLocaleString("pt-BR")} ${n === 1 ? "sessão" : "sessões"}`;

/** "{sessoes} hoje" + { sessoes: "12 sessões" } → "12 sessões hoje". Chave sem valor some com o espaço. */
export const fillText = (tpl: string, vars: Record<string, string | number>) =>
  tpl.replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] === undefined ? "" : String(vars[k]))).replace(/\s{2,}/g, " ").trim();

/**
 * Saudação viva: "Bom dia, Ana" e uma frase de contexto do perfil, montada só com dados que a tela já carregou.
 * `context` é a chave do texto (saudacao.recepcao, ...); `vars` preenche os {campos}. `as="h1"` no hero do paciente.
 */
export function Greeting({ context, vars, name, as = "p", className }: { context?: string; vars?: Record<string, string | number>; name?: string; as?: "p" | "h1"; className?: string }) {
  const { name: shellName, texts } = use(GreetContext);
  const first = (name ?? shellName).split(" ")[0];
  const H = as;
  const line = context && texts[context] ? fillText(texts[context], vars ?? {}) : "";
  return (
    <div className={className}>
      <H suppressHydrationWarning className={as === "h1" ? "greet-in font-display text-[34px] leading-tight sm:text-[40px]" : "greet-in font-display text-[26px] leading-tight sm:text-[30px]"}>
        {texts[`saudacao.${partOfDay(new Date())}`] ?? "Olá"}{first ? `, ${first}` : ""}
      </H>
      {line && <p className="greet-in greet-in-2 mt-1 max-w-prose text-ink-2">{line}</p>}
    </div>
  );
}
