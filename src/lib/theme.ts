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

export const THEME_REVEAL_MS = 520;
/** Centro de um elemento na tela: a origem da revelação (também no teclado, quando o clique não tem coordenadas). */
export const centerOf = (el: Element) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };

/**
 * Troca o tema. Sem `from`, direto (página pública, login). Com `from` e View Transitions, o tema novo se revela num círculo que cresce a partir de `from` (o botão);
 * com menos movimento, só um fade curto; sem a API, troca direto. O tema é aplicado dentro do callback, que o
 * navegador roda mesmo se a transição for pulada: nunca fica o tema errado.
 */
export function toggleTheme(from?: { x: number; y: number }) {
  const root = document.documentElement;
  const next = root.dataset.theme === "light" ? "dark" : "light";
  if (!from || typeof document.startViewTransition !== "function") return applyTheme(next);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Só durante a troca: a página inteira vira um quadro (fora disso, só o conteúdo tem nome; ver globals.css)
  root.dataset.vt = reduce ? "theme-fade" : "theme";
  let vt: ViewTransition;
  try {
    vt = document.startViewTransition(() => applyTheme(next));
  } catch {
    delete root.dataset.vt;
    return applyTheme(next);
  }
  const end = () => { if (root.dataset.vt?.startsWith("theme")) delete root.dataset.vt; };
  vt.finished.then(end, end);
  if (reduce) return;
  const { x, y } = from;
  const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  vt.ready.then(() => {
    root.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration: THEME_REVEAL_MS, easing: "cubic-bezier(0.65, 0, 0.35, 1)", pseudoElement: "::view-transition-new(root)" });
  }, () => {});
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

// Roda antes da primeira pintura: sem flash de tema nem de sidebar, e o véu da entrada (components/entry-transition.ts)
// já escuro quando o login recarrega a página. Só aceita "dark"; qualquer outro valor vira o claro.
// Também apaga a chave antiga, que fazia telas abrirem escuras.
export const THEME_SCRIPT = `(function(){var d=document.documentElement;function g(k){try{var v=localStorage.getItem(k);if(v)return v}catch(e){}var m=document.cookie.match(new RegExp("(?:^|; )"+k+"=([a-z]+)"));return m&&m[1]}try{localStorage.removeItem("mv-theme")}catch(e){}document.cookie="mv-theme=; path=/; max-age=0";d.dataset.theme=g("${THEME_KEY}")==="dark"?"dark":"light";d.dataset.sidebar=g("mv-sidebar")||"open";try{var e=sessionStorage.getItem("mv-entrada");if(e&&e!=="feita"&&Date.now()-e<6000&&/^\\/(app|recepcao|fisio|admin)(\\/|$)/.test(location.pathname))d.dataset.entrada=matchMedia("(prefers-reduced-motion: reduce)").matches?"rm":"in"}catch(e){}})()`;
