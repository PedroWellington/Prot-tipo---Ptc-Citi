const YEAR = 31_536_000;

function persist(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* armazenamento bloqueado */ }
  // O cookie cobre navegadores com localStorage bloqueado
  document.cookie = `${key}=${value}; path=/; max-age=${YEAR}; samesite=lax`;
}

export function toggleTheme() {
  const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  persist("mv-theme", next);
}

export function toggleSidebar() {
  const next = document.documentElement.dataset.sidebar === "collapsed" ? "open" : "collapsed";
  document.documentElement.dataset.sidebar = next;
  persist("mv-sidebar", next);
  // Web Animations só com transform: roda no compositor e não disputa com a largura da sidebar
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
    document.querySelector("[data-logo-mark]")?.animate(
      [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
      { duration: 560, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
}

// Roda antes da primeira pintura: sem flash de tema nem de sidebar
export const THEME_SCRIPT = `(function(){var d=document.documentElement;function g(k){try{var v=localStorage.getItem(k);if(v)return v}catch(e){}var m=document.cookie.match(new RegExp(k+"=([a-z]+)"));return m&&m[1]}d.dataset.theme=g("mv-theme")||(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark");d.dataset.sidebar=g("mv-sidebar")||"open"})()`;
