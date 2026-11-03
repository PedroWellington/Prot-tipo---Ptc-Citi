import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Lê o próprio tokens.css: se alguém trocar uma cor e quebrar o contraste, o teste falha
const css = readFileSync(path.resolve(__dirname, "tokens.css"), "utf8");

function block(selector: string) {
  const i = css.indexOf(selector);
  const body = css.slice(css.indexOf("{", i) + 1, css.indexOf("\n}", i));
  const vars: Record<string, string> = {};
  for (const m of body.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/--([\w-]+):\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
  const get = (name: string): string => {
    const v = vars[name];
    if (v === undefined) throw new Error(`--${name} não definido em ${selector}`);
    const ref = /^var\(--([\w-]+)\)$/.exec(v);
    return ref ? get(ref[1]) : v;
  };
  return get;
}

type RGBA = [number, number, number, number];
function parse(c: string): RGBA {
  const hex = /^#([0-9a-f]{6})$/i.exec(c);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)).concat(1) as RGBA;
  const rgb = /^rgb\((\d+) (\d+) (\d+)(?: \/ ([\d.]+))?\)$/.exec(c);
  if (rgb) return [+rgb[1], +rgb[2], +rgb[3], rgb[4] ? +rgb[4] : 1];
  throw new Error(`cor não reconhecida: ${c}`);
}
const over = (top: RGBA, base: RGBA): RGBA => [0, 1, 2].map((i) => top[i] * top[3] + base[i] * (1 - top[3])).concat(1) as RGBA;
const lum = ([r, g, b]: RGBA) => {
  const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a: RGBA, b: RGBA) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const stops = (gradient: string) => [...gradient.matchAll(/#[0-9a-f]{6}/gi)].map((m) => m[0]);

const THEMES = { claro: ':root, [data-theme="light"]', escuro: ':root[data-theme="dark"]' };

describe.each(Object.entries(THEMES))("Contraste AA dos tokens: tema %s", (_, selector) => {
  const t = block(selector);
  const color = (name: string, base?: RGBA) => { const c = parse(t(name)); return base ? over(c, base) : c; };
  const bg = color("bg"), surface = color("surface"), surface2 = color("surface-2"), sidebar = color("sidebar"), chrome = color("chrome");

  const pairs: [string, RGBA, RGBA][] = [
    ["ink/bg", color("ink"), bg], ["ink/surface", color("ink"), surface], ["ink/surface-2", color("ink"), surface2],
    ["ink-2/bg", color("ink-2"), bg], ["ink-2/surface", color("ink-2"), surface], ["ink-2/surface-2", color("ink-2"), surface2],
    ["ink-3/bg", color("ink-3"), bg], ["ink-3/surface", color("ink-3"), surface], ["ink-3/surface-2", color("ink-3"), surface2], ["ink-3/sidebar", color("ink-3"), sidebar],
    ["accent/surface", color("accent"), surface], ["accent/bg", color("accent"), bg],
    ["on-accent/accent-fill", color("on-accent"), color("accent-fill")],
    ["nav-ink/sidebar", color("nav-ink"), sidebar], ["nav-active-ink/nav-active", color("nav-active-ink"), color("nav-active", sidebar)],
    ["tab-ink/chrome", color("tab-ink"), chrome], ["tab-active-ink/tab-active", color("tab-active-ink"), color("tab-active-bg", chrome)],
    ...(["warn", "info", "danger", "ok"] as const).map((k) => [`${k}/${k}-soft`, color(k), color(`${k}-soft`, surface)] as [string, RGBA, RGBA]),
    ["band-ink/band", color("band-ink"), color("band-bg")], ["band-ink-2/band", color("band-ink-2"), color("band-bg")], ["band-num/band", color("band-num"), color("band-bg")],
    ["hero-on-cta/hero-cta", color("hero-on-cta"), color("hero-cta")],
    ...stops(t("hero")).flatMap((s) => [
      [`hero-ink/${s}`, color("hero-ink"), parse(s)], [`hero-ink-2/${s}`, color("hero-ink-2"), parse(s)],
      [`hero-badge/${s}`, color("hero-badge-ink"), color("hero-badge-bg", parse(s))],
    ] as [string, RGBA, RGBA][]),
    ...(t("cta").startsWith("linear") ? stops(t("cta")) : [t("cta")]).map((s) => [`on-cta/${s}`, color("on-cta"), parse(s)] as [string, RGBA, RGBA]),
  ];

  it.each(pairs)("%s ≥ 4.5:1", (_, fg, back) => {
    expect(ratio(fg, back)).toBeGreaterThanOrEqual(4.5);
  });
});
