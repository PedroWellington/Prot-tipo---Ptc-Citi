import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { countText } from "@/lib/motion";

/** Navegador mínimo para os módulos que tocam em document/sessionStorage (o vitest roda em Node). */
function fakeBrowser({ reduce = false } = {}) {
  const store = new Map<string, string>();
  const dataset: Record<string, string> = {};
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)), removeItem: (k: string) => void store.delete(k) };
  vi.stubGlobal("sessionStorage", storage);
  vi.stubGlobal("localStorage", { ...storage });
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: reduce && q.includes("reduce") }));
  vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: () => "#0a3540" }));
  vi.stubGlobal("innerWidth", 1280);
  vi.stubGlobal("innerHeight", 800);
  const doc = { documentElement: { dataset, animate: vi.fn() }, cookie: "", querySelector: () => null, querySelectorAll: () => [] as Element[] };
  vi.stubGlobal("document", doc);
  return { store, dataset, doc };
}

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe("Números contando (countText)", () => {
  it("termina exatamente no valor final, no formato pt-BR", () => {
    for (const v of ["R$ 10.897", "21,6%", "7 dias", "8/12", "Sessão 7 de 10", "1.234.567", "–"]) expect(countText("", v, 1)).toBe(v);
  });
  it("no meio do caminho mantém milhar com ponto, decimal com vírgula e as mesmas casas", () => {
    expect(countText("", "R$ 10.897", 0.5)).toBe("R$ 5.449");
    expect(countText("", "21,6%", 0.5)).toBe("10,8%");
    expect(countText("", "0,25", 0.5)).toBe("0,13");
  });
  it("filtro trocado: parte do valor atual, não de zero", () => {
    expect(countText("R$ 2.000", "R$ 10.000", 0)).toBe("R$ 2.000");
    expect(countText("30,0%", "20,0%", 0.5)).toBe("25,0%");
    expect(countText("7 dias", "3 dias", 0.5)).toBe("5 dias");
  });
});

describe("Transição de entrada", () => {
  beforeEach(() => vi.resetModules());

  it("só roda quando foi pedida, uma vez por login, e pedido velho não roda", async () => {
    const { entryDecision, ENTRY_DONE, ENTRY_STALE_MS } = await import("./entry-transition");
    const now = 1_000_000;
    expect(entryDecision(null, now).run).toBe(false);
    expect(entryDecision(ENTRY_DONE, now).run).toBe(false);
    expect(entryDecision(String(now - 500), now)).toEqual({ run: true, startedAt: now - 500 });
    expect(entryDecision(String(now - ENTRY_STALE_MS - 1), now).run).toBe(false);
    expect(entryDecision("lixo", now).run).toBe(false);
  });

  it("login → entra (escurece já); recarregar a página logada não roda de novo; sair libera a próxima", async () => {
    const { store, dataset } = fakeBrowser();
    const m = await import("./entry-transition");
    m.markEntry(false);
    expect(dataset.entrada).toBe("in");
    expect(store.get(m.ENTRY_KEY)).toMatch(/^\d+$/);
    m.resumeEntry(); // sem o véu no DOM de teste: cai no fade curto
    expect(store.get(m.ENTRY_KEY)).toBe(m.ENTRY_DONE);
    // Recarregou (ou trocou de aba): nada de véu
    delete dataset.entrada;
    expect(m.resumeEntry()).toBe(false);
    expect(dataset.entrada).toBeUndefined();
    // "Minha área" de novo no mesmo login: não escurece
    m.markEntry(true);
    expect(dataset.entrada).toBeUndefined();
    await m.playExit();
    expect(store.get(m.ENTRY_KEY)).toBeUndefined();
    m.markEntry(false);
    expect(dataset.entrada).toBe("in");
  });

  it("menos movimento: sem véu nem partículas, só o fade curto do conteúdo", async () => {
    const { dataset } = fakeBrowser({ reduce: true });
    const m = await import("./entry-transition");
    m.markEntry(true);
    expect(dataset.entrada).toBe("rm");
    m.resumeEntry();
    expect(m.entryActive()).toBe(false);
    await m.whenRevealed(); // os números não esperam nada
  });

  it("o script de antes da pintura só religa o véu nas rotas da área logada e é JavaScript válido", async () => {
    const { THEME_SCRIPT } = await import("@/lib/theme");
    expect(() => new Function(THEME_SCRIPT)).not.toThrow();
    const { SHELL_PATH } = await import("./entry-transition");
    for (const p of ["/app", "/app/mobilidade", "/recepcao/trocas", "/fisio", "/admin"]) expect(SHELL_PATH.test(p)).toBe(true);
    for (const p of ["/", "/login", "/cadastro", "/application", "/trocar-senha"]) expect(SHELL_PATH.test(p)).toBe(false);
    // O mesmo padrão nos dois lugares (o script não pode importar o módulo)
    expect(THEME_SCRIPT).toContain("/^\\/(app|recepcao|fisio|admin)(\\/|$)/");
  });
});

describe("Troca de tema por revelação circular", () => {
  it("o tema muda dentro do callback e fica salvo, com ou sem View Transitions", async () => {
    const { dataset, doc } = fakeBrowser();
    dataset.theme = "light";
    const { toggleTheme } = await import("@/lib/theme");
    // Navegador com a API: o callback roda (mesmo quando a transição é pulada) e o círculo nasce do botão
    let ready: () => void = () => {};
    const vt = { finished: Promise.resolve(), ready: new Promise<void>((r) => { ready = r; }) };
    Object.assign(doc, { startViewTransition: (cb: () => void) => { cb(); return vt; } });
    toggleTheme({ x: 10, y: 20 });
    expect(dataset.theme).toBe("dark");
    expect(localStorage.getItem("mv-tema")).toBe("dark");
    ready();
    await vt.ready;
    await Promise.resolve();
    expect(doc.documentElement.animate).toHaveBeenCalledWith(
      { clipPath: ["circle(0px at 10px 20px)", expect.stringMatching(/^circle\([\d.]+px at 10px 20px\)$/)] },
      expect.objectContaining({ pseudoElement: "::view-transition-new(root)" }),
    );
    await vt.finished;
    expect(dataset.vt).toBeUndefined();
    // API quebrada: troca direto, nunca fica no tema errado
    Object.assign(doc, { startViewTransition: () => { throw new Error("InvalidStateError"); } });
    toggleTheme({ x: 0, y: 0 });
    expect(dataset.theme).toBe("light");
    expect(dataset.vt).toBeUndefined();
    // Sem origem (página pública, login): troca direto, sem transição
    const spy = vi.fn();
    Object.assign(doc, { startViewTransition: spy });
    toggleTheme();
    expect(spy).not.toHaveBeenCalled();
    expect(dataset.theme).toBe("dark");
  });
});

describe("Nada fica invisível sem JavaScript ou com menos movimento", () => {
  const css = readFileSync(path.resolve(__dirname, "../styles/globals.css"), "utf8");
  const keyframes = (name: string) => css.match(new RegExp(`@keyframes ${name} \\{([^\\n]*)\\}`))?.[1] ?? "";

  it("as entradas só têm o quadro inicial: terminam no estado normal do elemento (visível)", () => {
    for (const k of ["enter", "fade", "bar", "bar-h", "ring-in", "vt-in", "vt-in-blur", "pop"]) {
      const body = keyframes(k);
      expect(body, k).toMatch(/^\s*from \{/);
      expect(body, k).not.toMatch(/\bto \{/);
    }
    // Entradas com "backwards" (nunca "forwards" segurando opacidade 0)
    for (const sel of [".reveal", ".stagger > *", ".greet-in"]) expect(css).toMatch(new RegExp(`${sel.replace(/[.*>]/g, "\\$&")} \\{ animation: enter [^;]*backwards`));
  });

  it("menos movimento desliga entradas, contagens visuais e o véu", () => {
    const rm = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    expect(rm).toContain(".stagger > *, .reveal, .greet-in { animation: none !important; }");
    expect(rm).toContain(".entry-veil { display: none !important; }");
    expect(rm).toContain(".bar, .bar-h, .ring-arc { animation: none !important; }");
  });

  it("o véu some sozinho se o JavaScript nunca assumir", () => {
    expect(css).toMatch(/:root\[data-entrada="in"\] \.entry-veil \{ animation: fade 150ms ease-out backwards, veil-safety 250ms ease-in 6s forwards; \}/);
    expect(keyframes("veil-safety")).toContain("visibility: hidden");
  });

  it("pílula sem JS: a opção ativa pinta o próprio fundo", () => {
    expect(css).toContain('.pills:not([data-pill-ready]) > [aria-checked="true"], .pills:not([data-pill-ready]) > [aria-selected="true"] { background: var(--accent-fill); }');
  });

  it("CountUp: o HTML do servidor já traz o valor final, e o leitor de tela também", async () => {
    const { CountUp } = await import("./motion");
    const html = renderToStaticMarkup(createElement(CountUp, { value: "R$ 10.897" }));
    expect(html).toBe('<span><span aria-hidden="true" class="tabular-nums">R$ 10.897</span><span class="sr-only">R$ 10.897</span></span>');
  });
});

describe("Saudação", () => {
  it("parte do dia pelo relógio de Recife e preenche só os campos que a tela tem", async () => {
    const { partOfDay, fillText, sessions } = await import("./motion");
    expect(partOfDay(new Date("2026-11-06T11:00:00Z"))).toBe("manha"); // 8h em Recife
    expect(partOfDay(new Date("2026-11-06T17:00:00Z"))).toBe("tarde"); // 14h
    expect(partOfDay(new Date("2026-11-06T23:30:00Z"))).toBe("noite"); // 20h30
    expect(fillText("Hoje: {sessoes} na agenda, {confirmar} a confirmar.", { sessoes: sessions(1), confirmar: "0" })).toBe("Hoje: 1 sessão na agenda, 0 a confirmar.");
    expect(fillText("Sua próxima sessão é {proxima}.", {})).toBe("Sua próxima sessão é .");
  });

  it("os textos são editáveis em Admin > Textos e têm padrão", async () => {
    const { SITE_FIELDS } = await import("@/lib/site-content");
    const keys = SITE_FIELDS.filter((f) => f.key.startsWith("saudacao.")).map((f) => f.key);
    expect(keys).toEqual(["saudacao.manha", "saudacao.tarde", "saudacao.noite", "saudacao.paciente", "saudacao.paciente.sem", "saudacao.recepcao", "saudacao.fisio", "saudacao.admin"]);
  });
});
