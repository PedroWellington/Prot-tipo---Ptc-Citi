/**
 * PortalEntrada: a transição de entrar na conta (e a de sair), numa sequência só, com UM renderizador de partículas.
 *
 *   1. dissolver  (0 → ~250 ms) a tela atual desfoca e esmaece; o fundo escuro cresce num círculo a partir do clique;
 *                 as partículas nascem no botão clicado — ou, com a cena da página inicial à vista, partem da forma
 *                 que está na tela (o canvas da cena é o mesmo renderizador: nada recomeça do zero);
 *   2. juntar     (até ~650 ms) cada partícula faz uma curva própria até a esfera de triângulos com o M, no centro;
 *   3. respirar   (só enquanto o destino carrega; sem mínimo) a esfera pulsa e gira devagar;
 *   4. explodir   (~500 ms) a esfera explode, o fundo escuro some junto e o destino aparece já montado.
 *
 * A autenticação e o carregamento correm em paralelo desde o clique (quem chama navega; o destino avisa com
 * portalReady()). Navegação do cliente: o documento é o mesmo do começo ao fim, sem corte seco.
 *
 * Nunca há marcador estático (o antigo "M" solto sobre um disco de brilho, que aparecia quando a explosão vencia a
 * corrida contra o carregamento do motor): sem renderizador pronto, a entrada é só um fade curto.
 * O renderizador fica aquecido antes do clique (preloadPortal): shaders compilados e formas baixadas.
 */
import type { Stage, StageOptions } from "./site/particle-stage";

export const GATHER_MS = 650;
export const GATHER_FAST_MS = 420;
export const EXPLODE_MS = 500;
export const EXIT_GATHER_MS = 450;
export const EXIT_BURST_MS = 300;
/** Destino que nunca fica pronto (erro de rede): explode mesmo assim, para nada ficar escuro. */
const READY_SAFETY_MS = 8000;
/** Rotas da área logada: só para elas o portal de entrada roda. */
export const SHELL_PATH = /^\/(app|recepcao|fisio|admin)(\/|$)/;
/** A saída leva a página inicial a abrir já com as partículas se juntando (THEME_SCRIPT + scene-driver). */
export const EXIT_KEY = "mv-saida";

const PALETTE = ["--particle-1", "--particle-2", "--particle-3", "--particle-4"] as const;
const SKIP = ["pointerdown", "keydown", "touchstart"] as const;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const mobile = () => matchMedia("(max-width: 767px), (pointer: coarse)").matches;
/** Celular, poucos núcleos ou conexão lenta: menos partículas e trajetórias mais curtas (nunca um total maior). */
export function lowEnd() {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return mobile() || (navigator.hardwareConcurrency ?? 8) <= 4 || !!c?.saveData || /(^|-)(2g|3g)$/.test(c?.effectiveType ?? "");
}
const particleCount = () => (mobile() ? 1400 : lowEnd() ? 2000 : 4500);
const palette = (): StageOptions["palette"] => {
  const cs = getComputedStyle(document.documentElement);
  return PALETTE.map((v) => cs.getPropertyValue(v).trim()) as StageOptions["palette"];
};
const veil = () => document.querySelector<HTMLElement>("[data-entry-veil]");
const status = (text: string) => { const s = document.querySelector("[data-portal-status]"); if (s) s.textContent = text; };

// ── Renderizador ──────────────────────────────────────────────────────────────
type Owned = { stage: Stage; canvas: HTMLCanvasElement; scene: boolean };
let warm: Owned | null = null;
let warming: Promise<Owned | null> | null = null;
let scene: { stage: Stage; canvas: HTMLCanvasElement } | null = null;
let adopted: Stage | null = null;

/** A cena da página inicial registra o seu palco: o portal usa o mesmo, em vez de abrir outro. */
export function setSceneStage(stage: Stage | null, canvas: HTMLCanvasElement | null) {
  scene = stage && canvas ? { stage, canvas } : null;
}
/** O portal levou o palco da cena: ao desmontar, a cena não o destrói (o portal destrói no fim). */
export const portalOwns = (stage: Stage | null) => !!stage && stage === adopted;

/**
 * Deixa o portal pronto antes do clique: baixa o motor e as formas e compila os shaders num canvas escondido.
 * Idempotente; chame no ocioso depois da primeira pintura e no hover/foco/toque dos botões de entrar.
 * Na página inicial com a cena viva não abre outro renderizador: o da cena é o do portal.
 */
export function preloadPortal(): Promise<Owned | null> {
  if (typeof window === "undefined" || reduce()) return Promise.resolve(null);
  if (warm && !warm.stage.lost) return Promise.resolve(warm);
  if (warming) return warming;
  if (document.querySelector("[data-scene]") && document.documentElement.classList.contains("scene-live")) {
    void import("./site/particle-stage");
    return Promise.resolve(null);
  }
  const v = veil();
  if (!v) return Promise.resolve(null);
  warming = (async () => {
    const canvas = document.createElement("canvas");
    canvas.className = "entry-canvas";
    canvas.setAttribute("aria-hidden", "true");
    v.append(canvas);
    try {
      const { startParticleStage } = await import("./site/particle-stage");
      const stage = await startParticleStage(canvas, { mobile: mobile(), intro: false, palette: palette(), pointer: false, centered: true, count: particleCount(), maxDpr: 1.5 });
      if (!stage || stage.kind !== "webgl") { stage?.destroy(); canvas.remove(); return null; }
      warm = { stage, canvas, scene: false };
      return warm;
    } catch {
      canvas.remove();
      return null;
    } finally {
      warming = null;
    }
  })();
  return warming;
}

/** O renderizador para esta execução: o da cena (se vivo) ou o aquecido. Nunca cria um no clique. */
function take(): Owned | null {
  if (scene && !scene.stage.lost && scene.stage.kind === "webgl") return { ...scene, scene: true };
  if (warm && !warm.stage.lost) { const w = warm; warm = null; return w; }
  return null;
}

// ── Execução ──────────────────────────────────────────────────────────────────
type Run = {
  kind: "entry" | "exit"; own: Owned | null; ready: boolean; gathered: boolean; done: boolean; rush: boolean;
  t0: number; cleanup: (() => void)[]; timers: ReturnType<typeof setTimeout>[]; phases: Record<string, number>;
};
let current: Run | null = null;
let revealed: Promise<void> = Promise.resolve();
let reveal: () => void = () => {};
/** Resolve quando o destino fica visível (a explosão começa); na hora, se não há portal. */
export const whenRevealed = () => revealed;
export const portalActive = () => !!current && !current.done;
/** Tempos da última execução (ms desde o clique), para medir e relatar. */
export let lastPhases: Record<string, number> = {};

const mark = (run: Run, name: string) => {
  run.phases[name] = Math.round(performance.now() - run.t0);
  // Para medir (roteiro e2e): os tempos da execução atual, em ms desde o clique
  (globalThis as { __portal?: Record<string, number> }).__portal = run.phases;
};

/** Fase 1: o fundo escuro cresce num círculo a partir do clique; a tela por baixo desfoca (CSS). */
function dissolve(v: HTMLElement, from: { x: number; y: number }, ms: number) {
  const r = Math.hypot(Math.max(from.x, innerWidth - from.x), Math.max(from.y, innerHeight - from.y));
  v.querySelector(".entry-bg")?.animate(
    { clipPath: [`circle(0px at ${from.x}px ${from.y}px)`, `circle(${r}px at ${from.x}px ${from.y}px)`], opacity: [0.6, 1] },
    { duration: ms, easing: "cubic-bezier(0.65, 0, 0.35, 1)", fill: "forwards" },
  );
}

function start(kind: Run["kind"], from: { x: number; y: number }): Run | null {
  if (current) return null; // duplo clique: uma execução só
  const root = document.documentElement;
  const v = veil();
  const own = v ? take() : null;
  if (!v || !own) return null;
  const run: Run = { kind, own, ready: false, gathered: false, done: false, rush: false, t0: performance.now(), cleanup: [], timers: [], phases: {} };
  current = run;
  revealed = new Promise((r) => { reveal = r; });
  const fast = lowEnd();
  const gatherMs = kind === "exit" ? EXIT_GATHER_MS : fast ? GATHER_FAST_MS : GATHER_MS;

  // Palco da cena: o mesmo canvas sobe para o véu, do mesmo tamanho, e continua desenhando a forma atual
  const { stage, canvas } = own;
  if (own.scene) adopted = stage;
  const sceneVisible = own.scene && (() => { const r = canvas.getBoundingClientRect(); return r.bottom > innerHeight * 0.4 && r.top < innerHeight * 0.6; })();
  if (canvas.parentElement !== v) v.append(canvas);
  canvas.classList.add("entry-canvas");
  root.dataset.portal = "on";
  status(kind === "entry" ? "Entrando na sua área" : "Saindo");
  // Mede o canvas no próximo quadro (nada de layout forçado no clique: o INP fica no custo do próprio clique)
  requestAnimationFrame(() => { if (!run.done) stage.resize(); });
  // Cores do tema atual (o renderizador aquecido pode ter nascido no outro tema)
  stage.setPalette(palette());
  stage.portal(sceneVisible ? null : from);
  mark(run, sceneVisible ? "morph" : "nasce");
  // Para medir (roteiro e2e): quantas execuções começaram nesta página
  const g = globalThis as { __portalRuns?: number };
  g.__portalRuns = (g.__portalRuns ?? 0) + 1;
  stage.gather(1, gatherMs);
  const coverMs = sceneVisible ? 200 : 300;
  dissolve(v, from, coverMs);
  // Coberta pelo fundo escuro, a tela de baixo não precisa mais ser pintada (nem desfocada): o painel novo monta
  // por baixo sem custo de pintura enquanto a esfera se forma
  run.timers.push(setTimeout(() => { if (!run.done) root.dataset.portalCover = ""; }, coverMs + 30));

  const skip = () => { if (run.rush) return; run.rush = true; mark(run, "pulo"); stage.gather(1, 120); if (run.ready) explode(run, true); };
  for (const e of SKIP) addEventListener(e, skip, { passive: true, capture: true });
  // Voltar do navegador no meio da transição: termina já, sem ficar escuro
  const onPop = () => { run.ready = true; skip(); };
  addEventListener("popstate", onPop);
  run.cleanup.push(() => { SKIP.forEach((e) => removeEventListener(e, skip, { capture: true })); removeEventListener("popstate", onPop); });

  run.timers.push(setTimeout(() => {
    run.gathered = true;
    mark(run, "juntou");
    if (run.ready) return explode(run);
    // Fase 3: respira só enquanto o destino carrega
    stage.pulse(1, 200);
    mark(run, "respiro");
  }, run.rush ? 120 : gatherMs));
  if (kind === "entry") run.timers.push(setTimeout(() => portalReady(), READY_SAFETY_MS));
  return run;
}

/** Fase 4: explode; o fundo escuro some junto e o destino (já montado) aparece. */
function explode(run: Run, fast = false) {
  if (run.done || !run.own) return;
  run.done = true;
  mark(run, "explosao");
  const root = document.documentElement;
  const v = veil()!;
  // As entradas do conteúdo (pausadas sob o véu) começam junto com a explosão
  root.dataset.portal = "burst";
  delete root.dataset.portalCover;
  reveal();
  const ms = fast ? 220 : EXPLODE_MS;
  run.own.stage.pulse(0, 100);
  run.own.stage.burst(1, ms * 0.85);
  v.querySelector(".entry-bg")?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms * 0.9, easing: EASE, fill: "forwards" });
  const fade = run.own.canvas.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms * 0.55, delay: ms * 0.45, easing: "ease-in", fill: "forwards" });
  const done = () => { mark(run, "fim"); teardown(run); focusTitle(); };
  fade.finished.then(done, done);
}

function teardown(run: Run) {
  run.timers.forEach(clearTimeout);
  run.cleanup.forEach((f) => f());
  reveal();
  if (run.own) {
    run.own.stage.destroy();
    run.own.canvas.remove();
    if (adopted === run.own.stage) adopted = null;
    if (scene?.stage === run.own.stage) scene = null;
  }
  const v = veil();
  v?.getAnimations({ subtree: true }).forEach((a) => a.cancel());
  delete document.documentElement.dataset.portal;
  delete document.documentElement.dataset.portalCover;
  status("");
  lastPhases = run.phases;
  if (current === run) current = null;
  // O próximo clique (sair, ou entrar de novo) já encontra um renderizador aquecido
  const idle = globalThis.requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 300));
  idle(() => void preloadPortal());
}

/** Foco no título da tela de destino (leitor de tela e teclado começam do lugar certo). */
function focusTitle() {
  const h = document.querySelector<HTMLElement>("main h1");
  if (!h) return;
  if (!h.hasAttribute("tabindex")) h.setAttribute("tabindex", "-1");
  h.focus({ preventScroll: true });
}

/** Menos movimento, ou renderizador ainda não pronto: só um fade curto do destino, sem partículas. */
function simpleFade() {
  const root = document.documentElement;
  root.dataset.portal = "fade";
  setTimeout(() => { if (root.dataset.portal === "fade") delete root.dataset.portal; }, 500);
}

/**
 * Entrar na conta (login, cadastro, "Minha área"): começa a sequência no clique. Quem chama navega em paralelo
 * (navegação do cliente) e, se o login falhar, chama portalCancel(). Devolve false quando caiu no fade simples.
 */
export function enterPortal(from: { x: number; y: number }): boolean {
  if (reduce()) { simpleFade(); return false; }
  const run = start("entry", from);
  if (!run) { if (!current) simpleFade(); return false; }
  mark(run, "clique");
  return true;
}

/** O destino terminou de montar (sem esqueleto de carregamento): pode explodir. */
export function portalReady() {
  const run = current;
  if (!run || run.done || run.kind !== "entry") return;
  run.ready = true;
  mark(run, "pronto");
  if (run.gathered || run.rush) explode(run, run.rush);
}

/** Login falhou: as partículas voltam para o botão e somem, o fundo recolhe e o formulário fica livre. */
export function portalCancel() {
  const run = current;
  if (!run || run.done || !run.own) { if (document.documentElement.dataset.portal === "fade") delete document.documentElement.dataset.portal; return; }
  run.done = true;
  run.timers.forEach(clearTimeout);
  const root = document.documentElement;
  delete root.dataset.portal; // a tela por baixo volta nítida (transição CSS)
  delete root.dataset.portalCover;
  run.own.stage.pulse(0, 100);
  run.own.stage.gather(0, 260);
  veil()?.querySelector(".entry-bg")?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: EASE, fill: "forwards" });
  root.dataset.portal = "cancel";
  setTimeout(() => { if (root.dataset.portal === "cancel") delete root.dataset.portal; teardown(run); }, 280);
}

/**
 * Sair (logout ou "Voltar à página inicial"): o app se dissolve em partículas que se juntam na esfera, que explode;
 * então a página inicial abre (navegação completa: nada da área logada fica em memória) e as suas partículas se
 * juntam saindo da mesma nuvem. Quem chama navega depois que a promessa resolve.
 */
export async function exitPortal(from: { x: number; y: number }): Promise<void> {
  try { sessionStorage.setItem(EXIT_KEY, String(Date.now())); } catch { /* armazenamento bloqueado */ }
  if (reduce()) return;
  const run = start("exit", from);
  if (!run || !run.own) return;
  mark(run, "clique");
  const { stage } = run.own;
  await new Promise((r) => setTimeout(r, EXIT_GATHER_MS));
  mark(run, "juntou");
  stage.burst(1, EXIT_BURST_MS);
  await new Promise((r) => setTimeout(r, EXIT_BURST_MS));
  mark(run, "explosao");
  lastPhases = run.phases;
  // Sem teardown: a página vai embora em seguida; o fundo escuro e a nuvem ficam até a próxima pintar
}
