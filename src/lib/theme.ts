const YEAR = 31_536_000;

function persist(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* armazenamento bloqueado */ }
  // O cookie cobre navegadores com localStorage bloqueado
  document.cookie = `${key}=${value}; path=/; max-age=${YEAR}; samesite=lax`;
}

/** Barra do navegador no celular: acompanha o tema escolhido, não o do sistema. */
export function syncThemeColor() {
  const color = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", color));
}

// Chave nova: versões antigas, com o escuro como padrão, deixaram "mv-theme" salvo nos navegadores
const THEME_KEY = "mv-tema";

function applyTheme(next: "light" | "dark") {
  document.documentElement.dataset.theme = next;
  persist(THEME_KEY, next);
  syncThemeColor();
}

export const THEME_REVEAL_MS = 560;
export const THEME_FADE_MS = 250;
const REVEAL_EASE = "cubic-bezier(0.65, 0, 0.35, 1)";
/** Centro de um elemento na tela: a origem da revelação (também no teclado, quando o clique não tem coordenadas). */
export const centerOf = (el: Element) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
/** Raio que cobre a tela inteira a partir de (x, y): a distância até o canto mais longe. */
export const coverRadius = (x: number, y: number, w: number, h: number) => Math.hypot(Math.max(x, w - x), Math.max(y, h - y));

/**
 * Troca o tema em qualquer tela (página pública, login, cadastro, recuperação e área logada), por um utilitário só.
 * - Com View Transitions: o tema novo se revela num círculo que cresce a partir de (origemX, origemY) até cobrir a tela;
 * - sem a API: o fundo antigo some num fade de 250 ms por cima do tema novo;
 * - com menos movimento: troca na hora.
 * O tema é aplicado dentro do callback, que o navegador roda mesmo se a transição for pulada: nunca fica o tema errado.
 * Nada é remontado: a cena de partículas só recebe a paleta nova (MutationObserver em data-theme) e segue de onde estava.
 */
export function trocarTema(origemX = innerWidth / 2, origemY = 0) {
  const root = document.documentElement;
  const next = root.dataset.theme === "light" ? "dark" : "light";
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return applyTheme(next);
  if (typeof document.startViewTransition !== "function") return fadeFallback(next);
  // Só durante a troca: a página inteira vira um quadro (fora disso, só o conteúdo tem nome; ver globals.css)
  root.dataset.vt = "theme";
  let vt: ViewTransition;
  try {
    vt = document.startViewTransition(() => applyTheme(next));
  } catch {
    delete root.dataset.vt;
    return applyTheme(next);
  }
  const end = () => { if (root.dataset.vt === "theme") delete root.dataset.vt; };
  vt.finished.then(end, end);
  const r = coverRadius(origemX, origemY, innerWidth, innerHeight);
  vt.ready.then(() => {
    root.animate({ clipPath: [`circle(0px at ${origemX}px ${origemY}px)`, `circle(${r}px at ${origemX}px ${origemY}px)`] },
      { duration: THEME_REVEAL_MS, easing: REVEAL_EASE, pseudoElement: "::view-transition-new(root)" });
  }, () => {});
}

/** Sem View Transitions: um véu com o fundo antigo cobre a troca e some em 250 ms. */
function fadeFallback(next: "light" | "dark") {
  const veil = document.createElement("div");
  veil.setAttribute("aria-hidden", "true");
  veil.style.cssText = `position:fixed;inset:0;z-index:2147483647;pointer-events:none;background:${getComputedStyle(document.documentElement).getPropertyValue("--bg")}`;
  document.body.append(veil);
  applyTheme(next);
  const a = veil.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: THEME_FADE_MS, easing: "ease-out", fill: "forwards" });
  if (a) a.finished.then(() => veil.remove(), () => veil.remove());
  else veil.remove();
}

const SIDE_MS = 650;
const SIDE_SHIFT = 180;
const SIDE_EASE = "cubic-bezier(0.65, 0, 0.35, 1)";
let sideTimer: ReturnType<typeof setTimeout> | undefined;

export function toggleSidebar() {
  const root = document.documentElement;
  const collapsing = root.dataset.sidebar !== "collapsed";
  const animate = matchMedia("(min-width: 1024px)").matches && !matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (animate) {
    root.dataset.sideAnim = "1";
    clearTimeout(sideTimer);
    sideTimer = setTimeout(() => delete root.dataset.sideAnim, SIDE_MS);
  }
  root.dataset.sidebar = collapsing ? "collapsed" : "open";
  persist("mv-sidebar", root.dataset.sidebar);
  if (!animate) return;

  const options = { duration: SIDE_MS, easing: SIDE_EASE };
  // Direção por ação: recolher gira para a esquerda, expandir para a direita. Sem fill: termina em 0, igual a 360
  const mark = document.querySelector("[data-logo-mark]");
  mark?.getAnimations().forEach((a) => a.cancel());
  mark?.animate([{ transform: "rotate(0deg)" }, { transform: `rotate(${collapsing ? -360 : 360}deg)` }], options);

  // A margem muda de uma vez só; a transição do conteúdo é transform, sem layout a cada quadro
  const content = document.querySelector("[data-side-content]");
  content?.getAnimations().forEach((a) => a.cancel());
  content?.animate([{ transform: `translateX(${collapsing ? SIDE_SHIFT : -SIDE_SHIFT}px)` }, { transform: "none" }], options);
}

// Roda antes da primeira pintura: sem flash de tema nem de sidebar. Só aceita "dark"; qualquer outro valor vira o claro.
// Também apaga a chave antiga, que fazia telas abrirem escuras.
export const THEME_SCRIPT = `(function(){var d=document.documentElement;function g(k){try{var v=localStorage.getItem(k);if(v)return v}catch(e){}var m=document.cookie.match(new RegExp("(?:^|; )"+k+"=([a-z]+)"));return m&&m[1]}try{localStorage.removeItem("mv-theme")}catch(e){}document.cookie="mv-theme=; path=/; max-age=0";d.dataset.theme=g("${THEME_KEY}")==="dark"?"dark":"light";d.dataset.sidebar=g("mv-sidebar")||"open"})()`;
