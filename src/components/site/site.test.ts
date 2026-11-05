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
import { layoutWords, Scene, SceneOrb, SCENE_SYMBOL } from "./scene";

const root = path.resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");
const css = read("src/styles/site.css");
const page = read("src/app/page.tsx");
const scene = read("src/components/site/scene.tsx");

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
    for (const r of all.filter((x) => /animation:\s*(site-rise|bob|drift|orb-intro|mark-intro|scene-p)/.test(x.body))) expect(r.selector).toMatch(/^\.motion-ok/);
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
    const ids = new Set([...(page + scene).matchAll(/id="([a-z-]+)"/g)].map((m) => m[1]));
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
    // A cena corta só na horizontal (overflow: hidden quebraria o sticky do palco)
    expect(scene).toMatch(/id="inicio"[^>]*overflow-x-clip/);
    expect(scene).not.toMatch(/id="inicio"[^>]*overflow-hidden/);
    expect(page).toMatch(/id="sistema"[^>]*overflow-x-clip/);
  });
});

describe("Cena de abertura", () => {
  const phrases = ["Menos faltas", "Mais sessões concluídas", "Tratamento até o fim", "Cuidado que acompanha você"];
  const html = renderToStaticMarkup(createElement(Scene, {
    hero: [{ node: createElement("h1", { id: "inicio-t" }, "Título da abertura"), lcp: true }, { node: createElement("p", null, "Frase da abertura"), lcp: true }],
    phrases,
  }));
  const text = html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ");

  it("todo o texto da cena está no HTML, na ordem de leitura (leitor de tela e sem JavaScript)", () => {
    for (const p of ["Título da abertura", "Frase da abertura", ...phrases]) expect(text).toContain(p);
    let at = 0;
    for (const p of phrases) { const i = text.indexOf(p, at); expect(i).toBeGreaterThanOrEqual(at); at = i; }
    // O primeiro quadro (título = LCP) já vem ativo do servidor; nenhum texto depende de JS para existir
    expect(html).toMatch(/class="scene-frame scene-hero hero-seq is-on"/);
    expect(html).toMatch(/class="scene-item hero-lcp"/);
  });

  it("sem .motion-ok (sem JS ou com menos movimento) não há palco preso nem texto escondido", () => {
    const hides = all.filter((r) => /position:\s*sticky|opacity:\s*0[;\s]|opacity:\s*0$|view-timeline|height:\s*var\(--scene-h\)/.test(r.body) && /scene|orb/.test(r.selector));
    expect(hides.length).toBeGreaterThan(0);
    // Vírgulas dentro de :is(...) não separam seletores
    for (const r of hides) for (const sel of r.selector.split(/,(?![^(]*\))/)) expect(sel.trim()).toMatch(/^\.motion-ok/);
    // E o script que liga .motion-ok não liga com prefers-reduced-motion
    expect(MOTION_SCRIPT).toMatch(/prefers-reduced-motion: reduce\)"\)\.matches\)return/);
  });

  it("com prefers-reduced-motion: nada de sticky nem altura de palco, mesmo que .motion-ok exista", () => {
    const reduced = all.filter((r) => r.media.some((m) => m.includes("prefers-reduced-motion: reduce")));
    const body = (sel: string) => reduced.find((r) => r.selector.split(",").map((x) => x.trim()).includes(sel))?.body ?? "";
    expect(body(".scene-sticky")).toContain("position: static !important");
    expect(body(".scene")).toContain("height: auto !important");
    expect(body(".orb-body")).toContain("animation: none");
  });

  it("só transform e opacity animam na cena; --p é a única variável que a rolagem escreve", () => {
    const sceneRules = all.filter((r) => /scene|orb/.test(r.selector) && /transition|animation/.test(r.body));
    for (const r of sceneRules) {
      const t = /transition:([^;]*)/.exec(r.body)?.[1] ?? "";
      for (const prop of t.split(",").map((x) => x.trim().split(" ")[0]).filter(Boolean)) expect(["transform", "opacity"]).toContain(prop);
    }
    expect(css).toMatch(/@property --p \{ syntax: "<number>"/);
    expect(css).toMatch(/animation-timeline: --scene/);
    expect(css).not.toMatch(/filter:\s*blur/);
    const driver = read("src/components/site/scene-driver.tsx");
    expect(driver).toContain('passive: true');
    expect(driver.match(/style\.setProperty\(/g)).toHaveLength(1);
    expect(driver).toContain('setProperty("--p"');
  });

  it("símbolo trocável: M por padrão, esfera lisa por variável", () => {
    expect(SCENE_SYMBOL).toBe("m");
    const m = renderToStaticMarkup(createElement(SceneOrb, {}));
    const liso = renderToStaticMarkup(createElement(SceneOrb, { symbol: "liso" }));
    expect(m).toContain('data-symbol="m"');
    expect(m).toContain("M3 25V8l9 11 9-11v17");
    expect(liso).toContain('data-symbol="liso"');
    expect(liso).not.toContain("<svg");
    expect(m).toContain('aria-hidden="true"');
  });

  it("palavras: lados alternados, entrada pelo lado onde param, metade acima e metade abaixo no celular", () => {
    const w = layoutWords("Mais sessões concluídas");
    expect(w.map((x) => x.word)).toEqual(["Mais", "sessões", "concluídas"]);
    expect(w.map((x) => x.side)).toEqual([-1, 1, -1]);
    expect(w.map((x) => x.x)).toEqual([-1, 1, -1]);
    expect(w.map((x) => x.ms)).toEqual([-1, -1, 1]);
    expect(layoutWords("  um  ")).toHaveLength(1);
    expect(layoutWords("Cuidado que acompanha você").filter((x) => x.ms < 0)).toHaveLength(2);
  });

  it("as frases são editáveis em Admin > Textos", () => {
    for (let i = 1; i <= 4; i++) expect(SITE_FIELDS.some((f) => f.key === `cena.${i}` && f.section === "Cena de abertura")).toBe(true);
    expect(page).toContain('phrases={[1, 2, 3, 4].map((i) => c[`cena.${i}`])}');
  });
});
