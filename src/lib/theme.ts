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

export function toggleTheme() {
  const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  persist("mv-theme", next);
  syncThemeColor();
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

// Roda antes da primeira pintura: sem flash de tema nem de sidebar
export const THEME_SCRIPT = `(function(){var d=document.documentElement;function g(k){try{var v=localStorage.getItem(k);if(v)return v}catch(e){}var m=document.cookie.match(new RegExp(k+"=([a-z]+)"));return m&&m[1]}d.dataset.theme=g("mv-theme")||"light";d.dataset.sidebar=g("mv-sidebar")||"open"})()`;
