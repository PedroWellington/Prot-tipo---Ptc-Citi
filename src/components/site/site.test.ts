import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { UserRound } from "lucide-react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SITE_FIELDS } from "@/lib/site-content";
import { SECTIONS } from "./header";
import { Marquee } from "./marquee";
import { MOTION_SCRIPT } from "./motion";

const root = path.resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");
const css = read("src/styles/site.css");
const page = read("src/app/page.tsx");

/** Regras do CSS com a pilha de @media em que estão. Basta para este arquivo (sem chaves em strings). */
function rules(text: string) {
  const out: { media: string[]; selector: string; body: string }[] = [];
  const stack: string[] = [];
  let buf = "";
  for (const ch of text.replace(/\/\*[\s\S]*?\*\//g, "")) {
    if (ch === "{") {
      const head = buf.trim();
      buf = "";
      stack.push(head);
    } else if (ch === "}") {
      const head = stack.pop() ?? "";
      if (!head.startsWith("@")) out.push({ media: stack.filter((h) => h.startsWith("@")), selector: head, body: buf.trim() });
      buf = "";
    } else buf += ch;
  }
  return out;
}
const all = rules(css);

describe("Faixa em movimento", () => {
  const items = [{ key: "a", icon: UserRound, title: "Dra. Fulana Teste", detail: "Fisioterapeuta · Boa Viagem" }, { key: "b", icon: UserRound, title: "Dr. Beltrano Teste" }];
  const html = renderToStaticMarkup(createElement(Marquee, { items, label: "Equipe" }));

  it("duplica o conteúdo e a cópia fica com aria-hidden", () => {
    const lists = html.match(/<ul class="marquee-list"[^>]*>/g)!;
    expect(lists).toHaveLength(2);
    expect(lists[0]).not.toContain("aria-hidden");
    expect(lists[1]).toContain('aria-hidden="true"');
    expect(html.match(/Dra\. Fulana Teste/g)).toHaveLength(2);
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="Equipe"');
    expect(html).toContain('tabindex="0"');
  });

  it("anima só com translateX e pausa sob o mouse e no foco de teclado", () => {
    expect(css).toMatch(/@keyframes marquee \{ to \{ transform: translateX\(-50%\); \} \}/);
    const pause = all.find((r) => r.body.includes("animation-play-state: paused"))!;
    expect(pause.selector).toContain(".marquee:hover .marquee-track");
    expect(pause.selector).toContain(".marquee:focus-within .marquee-track");
  });

  it("com menos movimento não há animação contínua e a faixa vira linha rolável", () => {
    const reduced = all.filter((r) => r.media.some((m) => m.includes("prefers-reduced-motion: reduce")));
    const body = (sel: string) => reduced.find((r) => r.selector.split(",").map((s) => s.trim()).includes(sel))?.body ?? "";
    expect(body(".marquee-track")).toContain("animation: none");
    expect(body(".float-card")).toContain("animation: none");
    expect(body(".marquee")).toContain("overflow-x: auto");
    expect(body(".marquee-list[aria-hidden]")).toContain("display: none");
    // O script que liga as entradas animadas também respeita a preferência
    expect(MOTION_SCRIPT).toContain("prefers-reduced-motion: reduce");
  });
});

describe("Entrada ao rolar e hover", () => {
  it("sem JavaScript nada fica invisível: só .motion-ok (posta pelo script) esconde os elementos", () => {
    const hiding = all.filter((r) => /opacity:\s*0[;\s]|opacity:\s*0$/.test(r.body) && /data-reveal|hero-seq|steps-line/.test(r.selector));
    expect(hiding.length).toBeGreaterThan(0);
    for (const r of hiding) for (const sel of r.selector.split(",")) expect(sel.trim().startsWith(".motion-ok")).toBe(true);
    // Keyframes de entrada também só rodam sob .motion-ok
    for (const r of all.filter((x) => /animation:\s*(rise|bob|drift)/.test(x.body))) expect(r.selector).toMatch(/^\.motion-ok/);
  });

  it("o hover só existe em dispositivos com mouse; no toque, só o retorno ao pressionar", () => {
    // O bloco de "menos movimento" só zera o efeito (transform: none), não cria hover
    const hovers = all.filter((r) => /:hover/.test(r.selector) && /\.lift|\.btn/.test(r.selector) && !/marquee/.test(r.selector) && !/^transform: none;?$/.test(r.body));
    expect(hovers.length).toBeGreaterThan(0);
    for (const r of hovers) expect(r.media.some((m) => m.includes("(hover: hover) and (pointer: fine)"))).toBe(true);
    const touch = all.find((r) => r.selector === ".lift:active")!;
    expect(touch.media.some((m) => m.includes("(hover: none)"))).toBe(true);
    // Sombra por opacidade de pseudo-elemento, nunca box-shadow animado; nada de blur
    expect(css).not.toMatch(/transition:[^;]*box-shadow/);
    expect(css).not.toMatch(/filter:\s*blur/);
  });
});

describe("Conteúdo honesto e navegação", () => {
  const sources = [page, ...readdirSync(path.join(root, "src/components/site")).filter((f) => f.endsWith(".tsx")).map((f) => read(`src/components/site/${f}`))].join("\n");
  const texts = SITE_FIELDS.map((f) => f.value).join("\n");

  it("nenhum depoimento, avaliação, número de pacientes, anos de experiência ou logo de empresa", () => {
    const forbidden = /depoimento|testemunho|★|estrelas|nota \d|avalia(ç|c)(ã|a)o \d|pacientes atendidos|\+\s?\d+\s?pacientes|anos de experi|parceir|patrocin|logo de/i;
    expect(sources).not.toMatch(forbidden);
    expect(texts).not.toMatch(forbidden);
    // Nenhuma imagem de logotipo publicada para a página
    expect(readdirSync(path.join(root, "public/site")).filter((f) => /logo|marca|parceir/i.test(f))).toEqual([]);
  });

  it("a faixa da equipe vem do banco e a de especialidades da lista editável", () => {
    expect(page).toMatch(/team\.map\(\(p\) => \(\{ key: p\.name/);
    expect(page).toContain('lines(c["faixa.especialidades"])');
    expect(SITE_FIELDS.some((f) => f.key === "faixa.especialidades")).toBe(true);
  });

  it("cada item do menu aponta para uma seção que existe; os links do rodapé também", () => {
    const ids = new Set([...page.matchAll(/id="([a-z-]+)"/g)].map((m) => m[1]));
    for (const [id] of SECTIONS) expect(ids.has(id)).toBe(true);
    for (const m of page.matchAll(/\["#([a-z-]+)",/g)) expect(ids.has(m[1])).toBe(true);
    expect(page).toContain('href="#inicio"');
    expect(read("src/components/site/header.tsx")).toContain('href="#conteudo"');
  });

  it("mantém noindex e o aviso de demonstração", () => {
    expect(page).toContain("robots: { index: false, follow: false");
    expect(page).toContain("Clínica fictícia. Conteúdo ilustrativo de demonstração.");
  });
});

describe("Sem rolagem lateral no celular", () => {
  it("as seções com mockup que saem da borda cortam o excesso", () => {
    expect(page).toMatch(/id="inicio"[^>]*overflow-hidden/);
    expect(page).toMatch(/id="sistema"[^>]*overflow-x-clip/);
  });
});
