/**
 * Transição de entrada do app: a tela escurece, a esfera de partículas com o "M" aparece, explode pela tela e,
 * enquanto o fundo escuro se dissolve, revela o painel já montado por trás. Saída: o inverso, curto.
 *
 * - O véu (.entry-veil) é HTML estático no layout raiz; `html[data-entrada]` o mostra. Na navegação completa
 *   (depois do login) o THEME_SCRIPT religa o atributo antes da primeira pintura, então não há piscada.
 * - Roda em paralelo ao carregamento: a explosão sai assim que o painel está pronto (no mínimo ENTRY_MIN_MS depois
 *   de a tela escurecer); se demorar, a esfera pulsa até ficar pronto (teto de WAIT_MAX_MS).
 * - Uma vez por login: "pendente" ao clicar em "Minha área" ou concluir o login; "feita" ao rodar; o sair limpa.
 *   Recarregar a página logada ou trocar de aba não roda de novo.
 * - Clique, toque ou tecla pulam. Menos movimento: só um fade curto do conteúdo, sem partículas.
 * - O motor de partículas é o da página pública (site/particle-stage.ts), baixado sob demanda.
 */
import type { Stage, StageOptions } from "./site/particle-stage";

export const ENTRY_KEY = "mv-entrada";
export const ENTRY_DONE = "feita";
/** Da tela escura até a explosão começar, no mínimo; a explosão leva EXPLODE_MS. Total ≈ 1,1 s. */
export const ENTRY_MIN_MS = 420;
export const EXPLODE_MS = 650;
export const EXIT_MS = 600;
const WAIT_MAX_MS = 4000;
/** Pedido mais velho que isso entra sem animação; o CSS apaga o véu sozinho depois de VEIL_SAFETY (globals.css). */
export const ENTRY_STALE_MS = 6000;
/** Rotas da área logada: só nelas o véu pode aparecer (o THEME_SCRIPT repete esta regra). */
export const SHELL_PATH = /^\/(app|recepcao|fisio|admin)(\/|$)/;

const PALETTE = ["--particle-1", "--particle-2", "--particle-3", "--particle-4"] as const;
const SKIP = ["pointerdown", "keydown", "touchstart", "wheel"] as const;

const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const store = {
  get: (): string | null => { try { return sessionStorage.getItem(ENTRY_KEY); } catch { return null; } },
  set: (v: string) => { try { sessionStorage.setItem(ENTRY_KEY, v); } catch { /* armazenamento bloqueado */ } },
  clear: () => { try { sessionStorage.removeItem(ENTRY_KEY); } catch { /* armazenamento bloqueado */ } },
};

/**
 * Decide o que fazer com o valor guardado na sessão. Pura, para testar:
 * "run" roda a entrada; "skip" não faz nada (já rodou neste login, ou nunca foi pedida).
 */
export function entryDecision(saved: string | null, now: number): { run: boolean; startedAt: number } {
  if (!saved || saved === ENTRY_DONE) return { run: false, startedAt: now };
  const at = Number(saved);
  // Pedido antigo (aba esquecida no meio do caminho): entra sem animação
  if (!Number.isFinite(at) || now - at > ENTRY_STALE_MS) return { run: false, startedAt: now };
  return { run: true, startedAt: Math.min(at, now) };
}

// Quem espera a revelação (contagens dos números): resolvido quando a explosão começa ou quando não há entrada
let revealed: Promise<void> = Promise.resolve();
let reveal: () => void = () => {};
/** Resolve quando o painel fica visível: na hora, sem entrada; no começo da explosão, com entrada. */
export const whenRevealed = () => revealed;

type Run = { stage: Stage | null; ready: boolean; finished: boolean; startedAt: number; cleanup: (() => void)[]; timer?: ReturnType<typeof setTimeout> };
let current: Run | null = null;

const veil = () => document.querySelector<HTMLElement>("[data-entry-veil]");
const palette = (): StageOptions["palette"] => {
  const cs = getComputedStyle(document.documentElement);
  return PALETTE.map((v) => cs.getPropertyValue(v).trim()) as StageOptions["palette"];
};
const mobile = () => matchMedia("(max-width: 767px), (pointer: coarse)").matches;
/** Menos partículas no celular e em aparelhos com poucos núcleos: a animação dura 1 s, não dá tempo de medir FPS. */
const particleCount = () => (mobile() ? 1400 : (navigator.hardwareConcurrency ?? 8) <= 4 ? 2500 : 4500);

/** Canvas novo a cada vez: o contexto WebGL anterior foi liberado no destroy(). */
async function mountStage(el: HTMLElement, intro: boolean): Promise<Stage | null> {
  const canvas = document.createElement("canvas");
  canvas.className = "entry-canvas";
  canvas.setAttribute("aria-hidden", "true");
  el.append(canvas);
  try {
    const { startParticleStage } = await import("./site/particle-stage");
    const s = await startParticleStage(canvas, { mobile: mobile(), intro, palette: palette(), pointer: false, centered: true, count: particleCount() });
    if (!s) canvas.remove();
    return s;
  } catch {
    canvas.remove();
    return null;
  }
}

function teardown(run: Run) {
  clearTimeout(run.timer);
  reveal();
  run.cleanup.forEach((f) => f());
  run.stage?.destroy();
  veil()?.querySelector(".entry-canvas")?.remove();
  const v = veil();
  v?.classList.remove("is-live", "is-waiting", "is-bursting");
  v?.getAnimations({ subtree: true }).forEach((a) => a.cancel());
  delete document.documentElement.dataset.entrada;
  if (current === run) current = null;
}

/** Explode e revela: o fundo escuro some junto com a dispersão; os pontos apagam no fim. */
function explode(run: Run, fast = false) {
  if (run.finished) return;
  run.finished = true;
  clearTimeout(run.timer);
  // As animações de entrada do conteúdo (pausadas sob o véu) começam junto com a explosão
  document.documentElement.dataset.entrada = "burst";
  reveal();
  const v = veil();
  if (!v) return teardown(run);
  v.classList.remove("is-waiting");
  v.classList.add("is-bursting");
  // Deixa o painel receber o clique já durante a dispersão
  v.style.pointerEvents = "none";
  const ms = fast ? 160 : EXPLODE_MS;
  run.stage?.burst(1, ms * 0.85);
  const ease = "cubic-bezier(0.22, 1, 0.36, 1)";
  v.querySelector(".entry-bg")?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms * 0.9, easing: ease, fill: "forwards" });
  if (!run.stage) v.querySelector(".entry-mark")?.animate([{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(1.6)" }], { duration: ms * 0.5, easing: ease, fill: "forwards" });
  const fade = v.querySelector(".entry-canvas")?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms * 0.55, delay: ms * 0.45, easing: "ease-in", fill: "forwards" });
  const done = () => { v.style.pointerEvents = ""; teardown(run); };
  if (fade) fade.finished.then(done, done);
  else setTimeout(done, ms);
}

function maybeExplode(run: Run) {
  if (run.finished || !run.ready) return;
  const wait = ENTRY_MIN_MS - (Date.now() - run.startedAt);
  if (wait > 0) { clearTimeout(run.timer); run.timer = setTimeout(() => explode(run), wait); return; }
  explode(run);
}

function begin(startedAt: number) {
  if (current) return;
  const root = document.documentElement;
  const v = veil();
  if (!v || reduce()) {
    // Menos movimento: o conteúdo só entra com um fade curto (CSS em html[data-entrada="rm"])
    root.dataset.entrada = "rm";
    setTimeout(() => { if (root.dataset.entrada === "rm") delete root.dataset.entrada; }, 400);
    return;
  }
  const run: Run = { stage: null, ready: false, finished: false, startedAt, cleanup: [] };
  current = run;
  revealed = new Promise((r) => { reveal = r; });
  // "run": o JS assumiu; desliga o fade de segurança do CSS (que some com o véu se o JS nunca chegar)
  root.dataset.entrada = "run";
  const skip = () => explode(run, true);
  for (const e of SKIP) addEventListener(e, skip, { passive: true, capture: true });
  run.cleanup.push(() => SKIP.forEach((e) => removeEventListener(e, skip, { capture: true })));
  // Se o painel demorar, a esfera pulsa; e nunca segura mais que WAIT_MAX_MS
  run.timer = setTimeout(() => !run.ready && v.classList.add("is-waiting"), ENTRY_MIN_MS);
  const cap = setTimeout(() => { run.ready = true; maybeExplode(run); }, WAIT_MAX_MS);
  run.cleanup.push(() => clearTimeout(cap));
  void mountStage(v, false).then((s) => {
    if (run.finished || current !== run) return s?.destroy();
    run.stage = s;
    if (s) v.classList.add("is-live");
  });
}

/** "Minha área" ou login concluído: escurece já e guarda o pedido (a navegação pode recarregar a página). */
export function markEntry(navigatesInPlace: boolean) {
  if (store.get() === ENTRY_DONE) return;
  const at = Date.now();
  store.set(String(at));
  document.documentElement.dataset.entrada = reduce() ? "rm" : "in";
  if (reduce()) return;
  // Navegação do cliente (o layout raiz fica): a animação começa agora, em paralelo ao carregamento
  if (navigatesInPlace) {
    void import("./site/particle-stage");
    begin(at);
  }
}

/** Montagem do app: roda a entrada se foi pedida. Devolve true quando há uma entrada em andamento. */
export function resumeEntry(): boolean {
  const saved = store.get();
  const { run, startedAt } = entryDecision(saved, Date.now());
  if (saved && saved !== ENTRY_DONE) store.set(ENTRY_DONE);
  if (current) return true;
  if (!run) {
    // Pedido vencido, ou véu religado sem pedido: nada pode ficar escuro
    if (document.documentElement.dataset.entrada !== "rm") delete document.documentElement.dataset.entrada;
    return false;
  }
  begin(startedAt);
  return !!current;
}

/** O painel terminou de carregar: a esfera pode explodir. */
export function entryReady() {
  if (!current) return;
  current.ready = true;
  maybeExplode(current);
}

export const entryActive = () => !!current && !current.finished;

/**
 * Saída: os pontos se juntam na esfera (~600 ms) sobre o fundo escuro; depois a página inicial abre inteira
 * (navegação completa, feita por quem chama). Também libera a próxima entrada.
 */
export async function playExit(): Promise<void> {
  store.clear();
  if (current) teardown(current);
  const v = veil();
  if (!v || reduce()) return;
  document.documentElement.dataset.entrada = "out";
  const stage = await Promise.race([mountStage(v, true), new Promise<null>((r) => setTimeout(() => r(null), 350))]);
  if (!stage) { await new Promise((r) => setTimeout(r, 200)); return; }
  v.classList.add("is-live");
  stage.burst(0, EXIT_MS);
  await new Promise((r) => setTimeout(r, EXIT_MS));
  // Sem destroy: a página vai embora logo em seguida, e a esfera fica parada na tela até lá
}
