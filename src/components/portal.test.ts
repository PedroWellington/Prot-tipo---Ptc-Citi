import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Navegador mínimo para o portal (o vitest roda em Node): véu, canvas, palco falso e eventos da janela. */
function fake({ reduce = false, veil = true, sceneTop = 0 } = {}) {
  const dataset: Record<string, string> = {};
  const store = new Map<string, string>();
  const handlers = new Map<string, Set<() => void>>();
  const finished = () => ({ finished: Promise.resolve(), cancel: vi.fn() });
  const bg = { animate: vi.fn(finished) };
  const veilEl = { append: vi.fn((c: { parentElement: unknown }) => { c.parentElement = veilEl; }), querySelector: () => bg, getAnimations: () => [] };
  const canvas = {
    parentElement: null as unknown, classList: { add: vi.fn() }, remove: vi.fn(), animate: vi.fn(finished),
    getBoundingClientRect: () => ({ top: sceneTop, bottom: sceneTop + 800 }),
  };
  const calls: string[] = [];
  const stage = {
    kind: "webgl" as const, lost: false,
    portal: vi.fn((s: unknown) => calls.push(`portal:${s ? "ponto" : "forma"}`)), gather: vi.fn((to: number, ms: number) => calls.push(`gather:${to}:${ms}`)),
    pulse: vi.fn((to: number) => calls.push(`pulse:${to}`)), burst: vi.fn((to: number) => calls.push(`burst:${to}`)),
    resize: vi.fn(), destroy: vi.fn(() => calls.push("destroy")),
    setProgress: vi.fn(), setPalette: vi.fn(), skipIntro: vi.fn(), relayout: vi.fn(),
  };
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: reduce && q.includes("reduce") }));
  vi.stubGlobal("sessionStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
  vi.stubGlobal("innerWidth", 1000);
  vi.stubGlobal("innerHeight", 800);
  vi.stubGlobal("navigator", { hardwareConcurrency: 8 });
  vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: () => "#5fe9dc" }));
  vi.stubGlobal("requestIdleCallback", () => 0);
  vi.stubGlobal("requestAnimationFrame", (f: () => void) => setTimeout(f, 16));
  vi.stubGlobal("addEventListener", (e: string, f: () => void) => { if (!handlers.has(e)) handlers.set(e, new Set()); handlers.get(e)!.add(f); });
  vi.stubGlobal("removeEventListener", (e: string, f: () => void) => handlers.get(e)?.delete(f));
  vi.stubGlobal("document", {
    documentElement: { dataset, classList: { contains: () => false } },
    querySelector: (s: string) => (s === "[data-entry-veil]" ? (veil ? veilEl : null) : s === "[data-portal-status]" ? { textContent: "" } : null),
  });
  const fire = (e: string) => [...(handlers.get(e) ?? [])].forEach((f) => f());
  return { dataset, store, stage, canvas, calls, fire, handlers };
}

beforeEach(() => { vi.useFakeTimers(); vi.resetModules(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

async function withScene(opts?: Parameters<typeof fake>[0]) {
  const f = fake(opts);
  const m = await import("./portal");
  m.setSceneStage(f.stage as never, f.canvas as never);
  return { ...f, m };
}

describe("Portal de entrada: uma sequência só, sem marcador estático", () => {
  it("o véu não tem 'M' solto nem disco de brilho: só o fundo e o canvas de partículas", () => {
    const layout = readFileSync(path.resolve(__dirname, "../app/layout.tsx"), "utf8");
    const css = readFileSync(path.resolve(__dirname, "../styles/globals.css"), "utf8");
    const veil = layout.slice(layout.indexOf("data-entry-veil"), layout.indexOf("data-portal-status"));
    expect(veil).not.toMatch(/Marca|entry-mark|<svg/);
    expect(css).not.toMatch(/\.entry-mark/);
    expect(css).toMatch(/\.entry-bg \{[^}]*clip-path: circle\(0px/);
  });

  it("sem renderizador pronto, nunca mostra um marcador: cai no fade simples", async () => {
    const f = fake();
    const m = await import("./portal");
    expect(m.enterPortal({ x: 10, y: 10 })).toBe(false);
    expect(f.dataset.portal).toBe("fade");
    expect(m.portalActive()).toBe(false);
  });

  it("fases em ordem: juntar → (destino pronto) explodir → fim, com o tempo total dentro do alvo", async () => {
    const { m, calls, dataset } = await withScene({ sceneTop: 2000 });
    expect(m.enterPortal({ x: 500, y: 400 })).toBe(true);
    expect(dataset.portal).toBe("on");
    expect(calls.slice(0, 2)).toEqual(["portal:ponto", `gather:1:${m.GATHER_MS}`]);
    m.portalReady(); // o painel montou antes de a esfera terminar de se juntar: sem respiro
    expect(calls).not.toContain("burst:1");
    await vi.advanceTimersByTimeAsync(m.GATHER_MS);
    expect(calls).toContain("burst:1");
    expect(calls).not.toContain("pulse:1");
    await vi.advanceTimersByTimeAsync(10);
    expect(calls.at(-1)).toBe("destroy");
    expect(dataset.portal).toBeUndefined();
    expect(m.GATHER_MS + m.EXPLODE_MS).toBeGreaterThanOrEqual(1000);
    expect(m.GATHER_MS + m.EXPLODE_MS).toBeLessThanOrEqual(1300);
  });

  it("destino demorando: respira só até ficar pronto", async () => {
    const { m, calls } = await withScene({ sceneTop: 2000 });
    m.enterPortal({ x: 1, y: 1 });
    await vi.advanceTimersByTimeAsync(m.GATHER_MS + 900);
    expect(calls).toContain("pulse:1");
    expect(calls).not.toContain("burst:1");
    m.portalReady();
    expect(calls).toContain("burst:1");
  });

  it("com a cena à vista, a forma atual vira a esfera (sem recomeçar); fora dela, nasce no botão", async () => {
    const a = await withScene({ sceneTop: 0 });
    a.m.enterPortal({ x: 1, y: 1 });
    expect(a.calls[0]).toBe("portal:forma");
    vi.resetModules();
    const b = await withScene({ sceneTop: 3000 });
    b.m.enterPortal({ x: 1, y: 1 });
    expect(b.calls[0]).toBe("portal:ponto");
  });

  it("duplo clique não roda duas vezes", async () => {
    const { m, stage } = await withScene();
    expect(m.enterPortal({ x: 1, y: 1 })).toBe(true);
    expect(m.enterPortal({ x: 1, y: 1 })).toBe(false);
    expect(stage.portal).toHaveBeenCalledTimes(1);
  });

  it("login com falha: as partículas voltam, o véu some e o formulário fica livre", async () => {
    const { m, calls, dataset } = await withScene();
    m.enterPortal({ x: 1, y: 1 });
    m.portalCancel();
    expect(calls).toContain("gather:0:260");
    expect(dataset.portal).toBe("cancel");
    await vi.advanceTimersByTimeAsync(300);
    expect(dataset.portal).toBeUndefined();
    expect(calls.at(-1)).toBe("destroy");
    expect(m.portalActive()).toBe(false);
    // E pode entrar de novo depois
    expect(m.enterPortal({ x: 1, y: 1 })).toBe(false); // o palco foi destruído: até reaquecer, fade simples
  });

  it("clique, toque ou tecla pulam para a explosão", async () => {
    const { m, calls, fire } = await withScene();
    m.enterPortal({ x: 1, y: 1 });
    m.portalReady();
    fire("pointerdown");
    expect(calls).toContain("gather:1:120");
    expect(calls).toContain("burst:1");
  });

  it("voltar do navegador no meio: termina já, sem tela escura presa", async () => {
    const { m, calls, fire } = await withScene();
    m.enterPortal({ x: 1, y: 1 });
    fire("popstate");
    expect(calls).toContain("burst:1");
  });

  it("menos movimento: só fade, sem partículas", async () => {
    const { m, stage, dataset } = await withScene({ reduce: true });
    expect(m.enterPortal({ x: 1, y: 1 })).toBe(false);
    expect(dataset.portal).toBe("fade");
    expect(stage.portal).not.toHaveBeenCalled();
  });

  it("destino que nunca fica pronto: explode mesmo assim (nada fica escuro)", async () => {
    const { m, calls } = await withScene();
    m.enterPortal({ x: 1, y: 1 });
    await vi.advanceTimersByTimeAsync(8100);
    expect(calls).toContain("burst:1");
  });

  it("saída: junta, explode e marca a chegada na página inicial (que começa da nuvem)", async () => {
    const { m, calls, store } = await withScene();
    const p = m.exitPortal({ x: 1, y: 1 });
    await vi.advanceTimersByTimeAsync(m.EXIT_GATHER_MS + m.EXIT_BURST_MS);
    await p;
    expect(calls).toContain("burst:1");
    expect(Number(store.get(m.EXIT_KEY))).toBeGreaterThan(0);
    expect(m.EXIT_GATHER_MS + m.EXIT_BURST_MS).toBeLessThanOrEqual(900);
  });

  it("o portal só roda para a área logada", async () => {
    const { SHELL_PATH } = await import("./portal");
    for (const p of ["/app", "/app/agendar", "/recepcao/trocas", "/fisio", "/admin"]) expect(SHELL_PATH.test(p)).toBe(true);
    for (const p of ["/", "/login", "/cadastro", "/application", "/trocar-senha"]) expect(SHELL_PATH.test(p)).toBe(false);
  });
});
