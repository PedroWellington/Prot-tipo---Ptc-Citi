"use client";

/**
 * Linguagem de movimento da área logada (o CSS que a acompanha está em globals.css, "Linguagem de movimento"):
 * - CountUp: indicadores contam do valor anterior (ou de 0 ao abrir a tela) até o novo;
 * - PillIndicator: um único destaque que desliza entre as opções de abas e filtros em pílula;
 * - useGrowFrom: barras de gráfico crescem do valor anterior para o novo quando um filtro muda;
 * - Greeting: saudação viva no início de cada perfil.
 * Só transform e opacity; com menos movimento, tudo aparece no valor final na hora.
 */
import { createContext, use, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { COUNT_MS, countText, easeOutExpo, reducedMotion, toMs } from "@/lib/motion";

const noop = () => () => {};
/** false enquanto o React hidrata o HTML do servidor; true quando o componente nasce no navegador. */
const useBornOnClient = () => useSyncExternalStore(noop, () => true, () => false);

/**
 * Número de indicador que conta até o valor (string já formatada em pt-BR ou número).
 * O HTML do servidor e o texto para leitores de tela trazem sempre o valor final; os passos são só visuais.
 * Nasceu na hidratação (o valor já estava pintado): não volta a 0.
 */
export function CountUp({ value, className }: { value: string | number; className?: string }) {
  const text = typeof value === "number" ? value.toLocaleString("pt-BR") : value;
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef<string | null>(null);
  const born = useBornOnClient();
  const fromZero = born;
  // O React escreve só o primeiro valor; depois o texto é do efeito (não disputam o mesmo nó)
  const [first] = useState(text);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = shown.current ?? (fromZero ? "" : text);
    shown.current = text;
    if (from === text || reducedMotion()) { el.textContent = text; return; }
    el.textContent = countText(from, text, 0);
    // Ao abrir a tela, começa junto com o bloco que fica nítido (--d, o atraso da cascata); num filtro, na hora
    const delay = from === "" ? toMs(getComputedStyle(el).getPropertyValue("--d")) : 0;
    const start = performance.now() + delay;
    let id = 0;
    const step = (now: number) => {
      const p = Math.max(0, Math.min(1, (now - start) / COUNT_MS));
      el.textContent = countText(from, text, easeOutExpo(p));
      if (p < 1) id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    // Interrompida por um valor novo: a próxima contagem parte do que está na tela
    return () => { cancelAnimationFrame(id); shown.current = el.textContent ?? text; };
  }, [text, fromZero]);
  return (
    <span className={className}>
      <span ref={ref} aria-hidden className="tabular-nums">{first}</span>
      <span className="sr-only">{text}</span>
    </span>
  );
}

// O mesmo tempo do indicador do menu (--dur-slide em globals.css)
// Mola (igual a --spring em globals.css): o destaque desliza e assenta com um balanço curto
const SLIDE_MS = 600;
const SPRING = "linear(0, 0.0516, 0.1731, 0.3253, 0.4815, 0.6252, 0.7478, 0.8458, 0.9197, 0.972, 1.0063, 1.0264, 1.036, 1.0384, 1.0362, 1.0314, 1.0255, 1.0195, 1.0141, 1.0094, 1.0057, 1.0029, 1.001, 0.9997, 1)";
const EASE_EXPO = "cubic-bezier(0.16, 1, 0.3, 1)";

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
        { duration: SLIDE_MS, easing: SPRING });
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
      el.animate([{ transform: x ? `scaleX(${k})` : `scaleY(${k})` }, { transform: "none" }], { duration: COUNT_MS, easing: EASE_EXPO });
    });
  });
  return ref;
}

/**
 * Troca com saída: o conteúdo antigo fica na tela por `ms` com a classe de saída (.tab-out) e só então o novo
 * entra (.tab-in). Com menos movimento, troca na hora.
 */
export function useSwap<T>(value: T, ms = 180) {
  const [shown, setShown] = useState(value);
  const leaving = shown !== value;
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => setShown(value), reducedMotion() ? 0 : ms);
    return () => clearTimeout(t);
  }, [value, leaving, ms]);
  return { shown, leaving };
}

const LITE_KEY = "mv-movimento-leve";
export const LITE_FPS = 50;
/** Quadros por segundo de uma amostra de tempos de quadro (ms entre requestAnimationFrame). */
export const fpsOf = (gaps: number[]) => (gaps.length ? 1000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length) : 60);

/**
 * Monitor leve de FPS: a cada troca de tela (não na hidratação), mede ~600 ms de quadros enquanto o conteúdo entra.
 * Abaixo de LITE_FPS, liga html[data-motion="lite"] (entradas sem desfoque) até o fim da sessão do navegador.
 */
export function useMotionBudget(key: string) {
  const first = useRef(true);
  useEffect(() => {
    const root = document.documentElement;
    try { if (sessionStorage.getItem(LITE_KEY)) root.dataset.motion = "lite"; } catch { /* armazenamento bloqueado */ }
    if (first.current) { first.current = false; return; }
    if (root.dataset.motion === "lite" || reducedMotion()) return;
    let id = 0, last = 0;
    const gaps: number[] = [];
    // Pula os primeiros 150 ms (o React montando a tela nova) e mede o resto da entrada
    const t0 = performance.now() + 150;
    const tick = (now: number) => {
      if (now >= t0) { if (last) gaps.push(now - last); last = now; }
      if (now - t0 < 600) id = requestAnimationFrame(tick);
      else if (fpsOf(gaps) < LITE_FPS) {
        root.dataset.motion = "lite";
        try { sessionStorage.setItem(LITE_KEY, "1"); } catch { /* armazenamento bloqueado */ }
      }
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [key]);
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
