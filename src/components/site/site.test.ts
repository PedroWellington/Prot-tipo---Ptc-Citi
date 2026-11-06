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
import { caminhos, VARIANTES } from "@/lib/marca";
import { MarcaMovimento } from "../marca";
import { placements } from "./particle-stage";
import { SystemTour } from "./product-tour";
import { FORMAS_DIR, Scene, SHAPES, splitWords } from "./scene";
import { frameAt, timeline } from "./scene-timeline";

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

describe("Abertura com partículas", () => {
  const phrases = ["Menos faltas.", "Mais sessões concluídas!", "Cuidado que acompanha você.", "Tratamento até o fim."];
  const subs = phrases.map((p) => `Texto embaixo de ${p}`);
  const html = renderToStaticMarkup(createElement(Scene, {
    hero: [{ node: createElement("h1", { id: "inicio-t" }, "Título da abertura"), lcp: true }, { node: createElement("p", null, "Frase da abertura"), lcp: true }],
    phrases: phrases.map((title, i) => ({ title, sub: subs[i] })),
    hint: { desktop: "Role para ver", mobile: "Deslize para ver" },
  }));
  const text = html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
  const live = all.filter((r) => /scene/.test(r.selector) && r.selector.includes(".scene-live"));
  const engine = read("src/components/site/particle-stage.ts");
  const driver = read("src/components/site/scene-driver.tsx");

  it("todo o texto está no HTML, na ordem de leitura; o canvas é decorativo e não recebe clique", () => {
    for (const p of ["Título da abertura", "Frase da abertura", ...phrases]) expect(text).toContain(p);
    let at = 0;
    for (const p of phrases) { const i = text.indexOf(p, at); expect(i).toBeGreaterThanOrEqual(at); at = i; }
    expect(html).toMatch(/<canvas aria-hidden="true" class="scene-canvas"/);
    expect(live.find((r) => r.selector === ".scene-live .scene-canvas")?.body).toContain("pointer-events: none");
    // O primeiro quadro (título = LCP) já vem ativo do servidor
    expect(html).toMatch(/class="scene-frame scene-hero is-on"/);
    expect(html).toMatch(/class="scene-item hero-lcp"/);
  });

  it("sem .scene-live (sem JS, sem WebGL2 ou com menos movimento): nada preso, nada escondido, formas em SVG estático", () => {
    const hides = all.filter((r) => /position:\s*sticky|opacity:\s*0[;\s]|opacity:\s*0$|height:\s*var\(--scene-h\)|display:\s*none/.test(r.body) && /scene-(sticky|frame|item|word|text)|\.scene(?![-\w])/.test(r.selector));
    // Canvas, brilho e dica são decorativos (sem texto): escondê-los no modo estático é o certo
    expect(hides.length).toBeGreaterThan(0);
    for (const r of hides) for (const sel of r.selector.split(/,(?![^(]*\))/)) expect(sel.trim()).toMatch(/^\.scene-live/);
    // Cada frase tem o desenho estático da forma (baixado só quando aparece)
    for (const s of SHAPES) expect(html).toContain(`src="${FORMAS_DIR}/${s.key}.svg"`);
    expect(html.match(/loading="lazy"/g)?.length).toBe(SHAPES.length + 1);
    // O script que liga o palco exige movimento permitido e WebGL2
    expect(MOTION_SCRIPT).toMatch(/prefers-reduced-motion: reduce/);
    expect(MOTION_SCRIPT).toContain('"WebGL2RenderingContext"in window)d.classList.add("scene-live")');
  });

  it("com prefers-reduced-motion: nenhum palco preso mesmo que a classe exista", () => {
    const reduced = all.filter((r) => r.media.some((m) => m.includes("prefers-reduced-motion: reduce")));
    const body = (sel: string) => reduced.find((r) => r.selector.split(",").map((x) => x.trim()).includes(sel))?.body ?? "";
    expect(body(".scene-sticky")).toContain("position: static !important");
    expect(body(".scene")).toContain("height: auto !important");
  });

  it("a página reaplica as classes ao montar (navegação do cliente), o palco zera ao entrar e sair termina em /", () => {
    expect(read("src/components/site/motion.tsx")).toMatch(/useLayoutEffect\(\(\) => \{[\s\S]*?applyMotionClasses\(\)/);
    expect(driver).toMatch(/useLayoutEffect\(\(\) => \{\s*applyMotionClasses\(\);/);
    expect(driver).toContain("scrollTo(0, 0)");
    expect(driver).toContain("stage?.destroy()");
    expect(read("src/components/app-shell.tsx")).toContain('location.replace("/")');
  });

  it("rolagem: um listener passivo que só grava o alvo; o motor só baixa depois da primeira pintura", () => {
    expect(driver.match(/addEventListener\("scroll"/g)).toHaveLength(1);
    expect(driver).toContain('addEventListener("scroll", onScroll, { passive: true })');
    expect(driver).toMatch(/requestIdleCallback/);
    expect(driver).toContain('await import("./particle-stage")');
    expect(read("src/app/page.tsx")).not.toContain("particle-stage");
  });

  it("motor: WebGL2 puro, uma chamada de desenho instanciada, DPR limitado, pausa fora da tela, libera tudo", () => {
    expect(engine).toContain('getContext("webgl2"');
    expect(engine.match(/drawArraysInstanced/g)).toHaveLength(1);
    expect(engine).toMatch(/opts\.mobile \? 1\.5 : 2/);
    expect(engine).toContain("new IntersectionObserver");
    expect(engine).toContain('"visibilitychange"');
    expect(engine).toMatch(/deleteBuffer[\s\S]*deleteVertexArray[\s\S]*deleteProgram/);
    expect(engine).toMatch(/fps < 50/);
    expect(engine).toContain('getContext("2d")');
    expect(read("package.json")).not.toMatch(/"three"|"pixi|"gsap"|"ogl"/);
  });

  it("linha do tempo: abertura, nuvem entre as formas e cada frase com a forma montada, alternando de lado", () => {
    expect(frameAt(0)).toBe(0);
    expect(timeline(0.92)).toEqual({ seg: 4, t: 1 });
    const seen = new Set<number>();
    for (let p = 0; p <= 1; p += 0.002) seen.add(frameAt(p));
    expect([...seen].sort()).toEqual([-1, 0, 1, 2, 3, 4]);
    // No meio de cada segmento é só nuvem, sem texto
    for (let s = 0; s < 5; s++) expect(frameAt(((s + 0.5) / 5) * 0.92)).toBe(-1);
    const d = placements(1366, 860, false);
    expect(d[0][0]).toBeGreaterThan(683);
    expect([d[1][0] < 683, d[2][0] > 683, d[3][0] < 683, d[4][0] > 683]).toEqual([true, true, true, true]);
    expect(html.match(/data-side="(r|l)"/g)).toEqual(['data-side="r"', 'data-side="l"', 'data-side="r"', 'data-side="l"']);
    // Celular: a esfera inicial fica acima do título
    const m = placements(360, 640, true, 260);
    expect(m[0][1] + m[0][2]).toBeLessThan(260);
  });

  it("palavras: frase editável quebrada em palavras, sem perder nenhuma", () => {
    expect(splitWords("  Cuidado   que acompanha você ")).toEqual(["Cuidado", "que", "acompanha", "você"]);
    for (let i = 1; i <= 4; i++) expect(SITE_FIELDS.some((f) => f.key === `cena.${i}` && f.section === "Cena de abertura")).toBe(true);
    expect(read("src/app/page.tsx")).toContain("phrases={[1, 2, 3, 4].map((i) => ({ title: c[`cena.${i}`], sub: c[`cena.${i}.sub`] }))}");
  });

  it("as formas geradas existem e o arquivo de pontos é pequeno", () => {
    const pub = path.join(root, "public/site");
    for (const s of [...SHAPES.map((x) => x.key), "esfera"]) expect(readdirSync(path.join(pub, "formas-v1"))).toContain(`${s}.svg`);
    for (const n of [2000, 6000]) {
      const j = JSON.parse(read(`public/site/particulas-v1-${n}.json`));
      expect(j.n).toBe(n);
      expect(Buffer.from(j.esfera, "base64")).toHaveLength(n * 4);
      for (const s of SHAPES) expect(Buffer.from(j[s.key], "base64")).toHaveLength(n * 2);
    }
    expect(read("public/site/particulas-v1-6000.json").length).toBeLessThan(110_000);
  });
});

describe("Monograma", () => {
  it("MarcaMovimento renderiza as 3 variantes, cada uma com seu traço", () => {
    const out = VARIANTES.map((v) => renderToStaticMarkup(createElement(MarcaMovimento, { variante: v, title: `M ${v}` })));
    out.forEach((h, i) => {
      expect(h).toContain(`data-variante="${VARIANTES[i]}"`);
      expect(h).toContain('role="img"');
      for (const d of caminhos(VARIANTES[i])) expect(h).toContain(d);
    });
    expect(new Set(out.map((h) => h.replace(/id="[^"]+"|url\(#[^)]+\)/g, ""))).size).toBe(3);
  });

  it("nenhuma variante tem o V reto central do M do Gmail: o meio é curva, círculo ou vértebras", () => {
    // Um "V" reto seria uma reta descendo até o meio (x = 24) e outra subindo; aqui o centro nunca é vértice de retas
    for (const v of VARIANTES) expect(caminhos(v).join(" ")).not.toMatch(/L24 /);
  });

  it("a página /marca-teste fica fora dos buscadores e sem link em menu", () => {
    const pagina = read("src/app/marca-teste/page.tsx");
    expect(pagina).toContain("robots: { index: false");
    for (const f of ["src/app/page.tsx", "src/components/site/header.tsx", "src/components/app-shell.tsx"]) expect(read(f)).not.toContain("marca-teste");
  });
});

describe("Veja o sistema por dentro: só o paciente", () => {
  const html = renderToStaticMarkup(createElement(SystemTour, { points: ["Acompanhe cada sessão."] }));
  it("sem abas e sem telas internas da clínica", () => {
    expect(html).not.toMatch(/role="tab"|Recepção|Fisioterapeuta|recepcao|fisio-/);
    expect(html).toContain("tela-v2-paciente-desktop");
    expect(html).toContain("tela-v2-paciente-celular");
    expect(read("src/app/page.tsx")).not.toMatch(/tour\.(recepcao|fisio)|recepcao-desktop|fisio-desktop/);
    expect(SITE_FIELDS.some((f) => /tour\.(recepcao|fisio)/.test(f.key))).toBe(false);
    expect(readdirSync(path.join(root, "public/site")).filter((f) => /tela-(recepcao|fisio)/.test(f))).toEqual([]);
    expect(read("src/lib/site-screens.ts")).not.toMatch(/recepcao|fisio/);
  });
});

describe("Rodada 3: aviso, cabeçalho da cena, subtextos e atalhos", () => {
  const phrases = SITE_FIELDS.filter((f) => /^cena\.\d$/.test(f.key));
  const subs = SITE_FIELDS.filter((f) => /^cena\.\d\.sub$/.test(f.key));
  const html = renderToStaticMarkup(createElement(Scene, {
    hero: [{ node: createElement("h1", { id: "inicio-t" }, "Título") }, { node: createElement("a", { href: "/login" }, "Agendar tratamento") }],
    phrases: phrases.map((p, i) => ({ title: p.value, sub: subs[i].value })),
    hint: { desktop: "Role para ver", mobile: "Deslize para ver" },
  }));
  const header = read("src/components/site/header.tsx");
  const driver = read("src/components/site/scene-driver.tsx");

  it("frases com pontuação e um texto curto embaixo de cada uma, editáveis em Admin > Textos", () => {
    expect(phrases.map((p) => p.value)).toEqual(["Menos faltas.", "Mais sessões concluídas!", "Cuidado que acompanha você.", "Tratamento até o fim."]);
    expect(subs).toHaveLength(4);
    for (const s of subs) {
      const frases = s.value.split(/(?<=[.!?])\s+/).filter(Boolean);
      expect(frases.length).toBeGreaterThanOrEqual(2);
      expect(frases.length).toBeLessThanOrEqual(3);
      expect(html).toContain(s.value);
      // Nada de número, prazo, estatística ou promessa médica
      expect(s.value).not.toMatch(/\d|%|cura|garant|depoiment|empresa/i);
    }
    // Cada subtexto entra depois do título (atraso = palavras × 60 ms + 100 ms) e sai junto com o quadro
    const sub = all.find((r) => r.selector === ".scene-live .scene-sub" && r.body.includes("transition-delay"));
    expect(sub?.body).toContain("calc(var(--n, 1) * 60ms + 100ms)");
    expect(all.find((r) => r.selector === ".scene-live .scene-frame:not(.is-on) .scene-sub")?.body).toContain("opacity: 0");
  });

  it("aviso \"Role para ver\": na primeira tela, editável, some depois de ~40 px e volta no topo", () => {
    expect(SITE_FIELDS.find((f) => f.key === "cena.dica")?.value).toBe("Role para ver");
    expect(SITE_FIELDS.find((f) => f.key === "cena.dica.celular")?.value).toBe("Deslize para ver");
    expect(html).toMatch(/<a href="#cena-1" class="scene-hint" data-scene-hint="true">/);
    expect(html).toContain("Role para ver");
    expect(html).toContain("Deslize para ver");
    expect(html).toContain('id="cena-1"');
    const live = all.find((r) => r.selector === ".scene-live .scene-hint");
    expect(live?.body).toMatch(/bottom: max\(20px, 3svh\)/);
    expect(live?.body).toMatch(/animation: hint-in 300ms[^;]* 300ms/);
    expect(all.find((r) => r.selector === ".hint-arrow")?.body).toContain("animation: hint-pulse 1.6s");
    expect(css).toMatch(/@keyframes hint-pulse \{[^}]*transform[^}]*opacity/);
    expect(driver).toContain("scrollY <= 40");
    expect(driver).toContain("FIRST_SHAPE");
    // Menos movimento: sem pulso
    const reduced = all.filter((r) => r.media.some((m) => m.includes("prefers-reduced-motion: reduce")));
    expect(reduced.find((r) => r.selector.includes(".hint-arrow"))?.body).toContain("animation: none");
  });

  it("o hero não tem \"Ver o sistema\" nem nenhuma âncora que pule a cena", () => {
    const page = read("src/app/page.tsx");
    // "<Scene" seguido de quebra de linha: o componente da cena, não o <SceneDriver />
    const sceneBlock = page.slice(page.search(/<Scene\s*\r?\n/), page.indexOf("/>", page.indexOf("hint={{")));
    expect(sceneBlock).not.toContain("Ver o sistema");
    expect(sceneBlock).not.toMatch(/href="#(?!cena-1)/);
    expect(page).not.toContain('href="#sistema" className="btn');
    expect(html).not.toMatch(/href="#(?!cena-1)/);
  });

  it("cabeçalho durante a cena: só logo, tema e Entrar; seções e menu ficam inert e escondidos", () => {
    expect(header).toContain('inert={scene}');
    expect(header.match(/inert=\{scene\}/g)!.length).toBeGreaterThanOrEqual(3);
    const cena = all.find((r) => r.selector.includes('.scene-live .site-header:not([data-mode="completo"]) :is(.header-sections, .header-extra)'));
    expect(cena?.body).toMatch(/visibility: hidden/);
    expect(all.find((r) => r.selector === '.scene-live .site-header:not([data-mode="completo"]) .header-menu')?.body).toContain("display: none");
    // Transparente, sem borda nem sombra, texto claro da banda
    expect(all.find((r) => r.selector === '.scene-live .site-header:not([data-mode="completo"])::before')?.body).toMatch(/translateY\(-100%\); opacity: 0/);
    expect(all.find((r) => r.selector === '.scene-live .site-header:not([data-mode="completo"])::after')?.body).toContain("opacity: 0");
    expect(all.find((r) => r.selector === '.scene-live .site-header:not([data-mode="completo"])')?.body).toContain("--ink: var(--hero-ink)");
    // O palco começa atrás do cabeçalho: a tela tem uma cor só
    expect(all.find((r) => r.selector === ".scene-live .scene")?.body).toContain("margin-top: -64px");
    // Pular para o conteúdo continua
    expect(header).toContain('href="#conteudo"');
  });

  it("o menu completo desce no fim do palco e sobe ao voltar: um IntersectionObserver no marcador", () => {
    expect(html).toMatch(/class="scene-end" data-scene-end="true"/);
    expect(header.match(/new IntersectionObserver/g)).toHaveLength(2); // seção ativa + fim do palco
    expect(header).toMatch(/querySelector\("\[data-scene-end\]"\)/);
    expect(header).toMatch(/e\.isIntersecting \|\| e\.boundingClientRect\.top < 0 \? "completo" : "cena"/);
    const desce = all.find((r) => r.selector === ".site-header::before");
    expect(desce?.body).toMatch(/transition: transform 320ms[^;]*opacity 320ms/);
    expect(header).not.toMatch(/addEventListener\("scroll"/);
  });

  it("sem palco (menos movimento, sem JS ou abrindo por âncora): menu completo sempre", () => {
    // O visual de cena só existe sob .scene-live, que o script não liga com prefers-reduced-motion
    const cenaRules = all.filter((r) => r.selector.includes('site-header:not([data-mode="completo"])'));
    expect(cenaRules.length).toBeGreaterThan(0);
    for (const r of cenaRules) expect(r.selector.trim()).toMatch(/^\.scene-live/);
    expect(MOTION_SCRIPT).toMatch(/prefers-reduced-motion: reduce/);
    // O HTML do servidor não marca nada como inert (o modo começa indefinido); com âncora, completo
    expect(header).toMatch(/useState<"cena" \| "completo" \| null>\(null\)/);
    expect(header).toMatch(/if \(!end \|\| !live \|\| location\.hash\)/);
  });

  it("formas ~12% maiores sem sair da tela nem invadir o texto", () => {
    const w = 1366, h = 860;
    const d = placements(w, h, false);
    for (const [x, y, s] of d) {
      expect(x - s * 0.8).toBeGreaterThan(0);
      expect(x + s * 0.8).toBeLessThan(w);
      expect(y - s).toBeGreaterThan(64);
      expect(y + s).toBeLessThan(h);
    }
    // Forma à esquerda não passa do começo do texto (54% da largura)
    expect(d[1][0] + d[1][2] * 0.7).toBeLessThan(w * 0.54);
    for (const [cw, ch] of [[390, 844], [360, 640]]) {
      const m = placements(cw, ch, true, ch * 0.55);
      for (const [x, , s] of m.slice(1)) { expect(x - s * 0.7).toBeGreaterThan(0); expect(x + s * 0.7).toBeLessThan(cw); }
    }
  });
});
