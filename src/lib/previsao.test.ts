import { describe, expect, it } from "vitest";
import { matchNames, parseQuestion } from "./assistente";
import { applyPrivacy, exportFileName, hasNames, initials, scrub, type ExportSpec } from "./exportar";
import { render, type Ctx, type Palette } from "./exportar-png";
import {
  auc, breakdown, buildRateModel, mape, monthForecast, MIN_SAMPLE, patientRisk, quantile, simulateLoss,
  type FutureSession, type HistRow, type PatientHistory,
} from "./previsao";

const rows = (n: number, misses: number, seg: Partial<HistRow> = {}): HistRow[] =>
  Array.from({ length: n }, (_, i) => ({ type: "PARTICULAR", number: 3, band: "9–12h", unit: "BV", missed: i < misses, ...seg }));

const future = (n: number, p: number, value = 100): FutureSession[] =>
  Array.from({ length: n }, (_, i) => ({ id: String(i), value, p, day: 1 + (i % 28), unit: "BV", type: "PARTICULAR", band: "9–12h", number: 3, confirmed: false, renewalPending: false }));

describe("Previsão: taxa por segmento", () => {
  it("com amostra grande, a probabilidade bate com a taxa histórica do segmento", () => {
    const m = buildRateModel(rows(400, 100));
    expect(m.rateFor({ type: "PARTICULAR", number: 3, band: "9–12h", unit: "BV" }).rate).toBeCloseTo(0.25, 2);
  });

  it("segmento pequeno usa o pai e puxa para ele (suavização Beta)", () => {
    const base = [...rows(300, 30, { number: 6 }), ...rows(10, 8, { number: 6, band: "17–20h" })];
    const r = buildRateModel(base).rateFor({ type: "PARTICULAR", number: 6, band: "17–20h", unit: "BV" });
    expect(r.level).toBe("tipo + sessão"); // 10 < MIN_SAMPLE: não confia no segmento fino
    expect(r.rate).toBeGreaterThan(0.1);
    expect(r.rate).toBeLessThan(0.8);
    expect(MIN_SAMPLE).toBe(30);
  });
});

describe("Previsão: mês", () => {
  const f = monthForecast({ realized: 1000, pastLoss: 200, future: future(50, 0.8) });

  it("receita esperada = realizada + soma de valor × p", () => {
    expect(f.revenue.expected).toBeCloseTo(1000 + 50 * 100 * 0.8, 6);
  });
  it("receita futura + perda futura = total agendado", () => {
    expect(f.revenue.expected - 1000 + (f.loss.expected - 200)).toBeCloseTo(f.scheduled, 6);
    expect(f.revenue.median - 1000 + (f.loss.median - 200)).toBeCloseTo(f.scheduled, 6);
  });
  it("as faixas contêm a média e a de 90% contém a de 80%", () => {
    for (const r of [f.revenue, f.loss]) {
      expect(r.p80[0]).toBeLessThanOrEqual(r.expected);
      expect(r.p80[1]).toBeGreaterThanOrEqual(r.expected);
      expect(r.p90[0]).toBeLessThanOrEqual(r.p80[0]);
      expect(r.p90[1]).toBeGreaterThanOrEqual(r.p80[1]);
    }
  });
  it("2.000 sorteios em menos de 300 ms com 400 sessões", () => {
    const t = performance.now();
    monthForecast({ realized: 0, pastLoss: 0, future: future(400, 0.8) });
    expect(performance.now() - t).toBeLessThan(300);
  });
  it("quebras somam a perda total", () => {
    const fut = future(10, 0.7);
    const b = breakdown(fut, [{ key: "BV", loss: 55 }], (s) => s.unit);
    expect(b[0].totalLoss).toBeCloseTo(55 + 10 * 100 * 0.3, 6);
  });
  it("quantil interpola", () => expect(quantile([0, 10], 0.5)).toBe(5));
});

describe("Simulador", () => {
  it("reduzir a falta da 6ª sessão diminui a perda; zero em tudo não muda", () => {
    const s = [{ value: 55, rate: 0.44, rate6: 0.44, rateOffPeak: 0.15, peak: true, conv6: true, confirmed: false }];
    expect(simulateLoss(s, { reduce6pp: 0, remindersPct: 0, saturdayPct: 0 }).saved).toBe(0);
    expect(simulateLoss(s, { reduce6pp: 20, remindersPct: 0, saturdayPct: 0 }).saved).toBeCloseTo(55 * 0.2, 6);
    expect(simulateLoss(s, { reduce6pp: 20, remindersPct: 20, saturdayPct: 30 }).saved).toBeGreaterThan(55 * 0.2);
  });
});

describe("Risco por paciente", () => {
  const base: PatientHistory = { done: 6, missed: 0, lateCancels: 0, lates: 0, reschedules: 0, streak: 6, lastMissed: false, confirmedRate: 1 };
  const next = { type: "PARTICULAR" as const, number: 7, band: "9–12h", confirmed: false, renewalPending: false };

  it("sobe com faltas recentes e explica o porquê", () => {
    const calm = patientRisk(0.15, base, next);
    const missed = patientRisk(0.15, { ...base, missed: 2, streak: 0, lastMissed: true }, next);
    expect(missed.p).toBeGreaterThan(calm.p);
    expect(missed.factors).toContain("faltou a última sessão");
    expect(missed.action).toBe("Ligar para o paciente");
  });
  it("com pouco histórico fica perto da taxa do grupo e a confiança é baixa", () => {
    const r = patientRisk(0.3, { ...base, done: 1, streak: 1 }, next);
    expect(r.confidence).toBe("baixa");
    expect(Math.abs(r.p - 0.3)).toBeLessThan(0.08);
  });
  it("6ª sessão de convênio e pico aparecem como fatores", () => {
    const r = patientRisk(0.44, base, { ...next, type: "CONVENIO", number: 6, band: "17–20h" });
    expect(r.factors).toEqual(expect.arrayContaining(["6ª sessão de convênio", "horário de pico"]));
  });
});

describe("Backtest", () => {
  it("MAPE e AUC", () => {
    expect(mape([90, 110], [100, 100])).toBeCloseTo(10, 6);
    expect(auc([0.9, 0.8, 0.2, 0.1], [true, true, false, false])).toBe(1);
    expect(auc([0.5, 0.5], [true, false])).toBe(0.5);
  });
});

describe("Assistente: intenções", () => {
  const cases: [string, string | null][] = [
    ["Previsão de faltas da próxima semana", "faltas_semana"], ["Previsão de faltas do mês", "faltas_mes"],
    ["Quanto vou perder este mês?", "perda_mes"], ["Qual a receita prevista do mês?", "receita_mes"],
    ["Pacientes com maior risco de faltar", "pacientes_risco"], ["Risco do paciente Helvira Lindoval", "risco_paciente"],
    ["Qual horário tem mais faltas?", "horario_faltas"], ["Como reduzir as faltas da 6ª sessão?", "reduzir_6a"],
    ["bom dia", null],
  ];
  it.each(cases)("%s → %s", (q, intent) => expect(parseQuestion(q).intent).toBe(intent));
  it("extrai período, unidade e nome", () => {
    const p = parseQuestion("faltas da próxima semana em Casa Forte");
    expect([p.period, p.unit]).toEqual(["proxima_semana", "CF"]);
    expect(parseQuestion("risco da helvira").name).toBe("helvira");
  });
  it("nomes parecidos voltam todos para confirmação", () => {
    const people = [{ name: "Helvira Lindoval" }, { name: "Helvira Brenhaus" }, { name: "Isandro Fontarelo" }];
    expect(matchNames("helvira", people)).toHaveLength(2);
    expect(matchNames("Helvira Lind", people)).toEqual([{ name: "Helvira Lindoval" }]);
  });
});

// Contexto 2D falso: grava os textos e mede 9 px por letra
function fakeCtx() {
  const texts: string[] = [];
  const ctx = {
    fillStyle: "", strokeStyle: "", font: "", lineWidth: 1, textAlign: "left", textBaseline: "alphabetic",
    fillText: (t: string) => { texts.push(t); }, measureText: (t: string) => ({ width: t.length * 9 }),
    fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, closePath() {}, setLineDash() {}, save() {}, restore() {}, scale() {},
  } as unknown as Ctx;
  return { ctx, texts };
}
const pal = (bg: string): Palette => ({ bg, card: "#eee", ink: "#000", ink2: "#333", ink3: "#666", line: "#ccc", series: ["#0b8f63", "#2f7de1", "#12a5a0", "#ef6a5b", "#f2a516"], band: "#dfe" });
const fonts = { sans: "system-ui", display: "Georgia" };

describe("Exportação PNG", () => {
  const risk: ExportSpec = {
    item: "pacientes-risco", title: "Risco de falta por paciente", filters: { unidade: "Boa Viagem", periodo: "semana-atual" },
    body: { kind: "table", nameCol: 0, columns: ["Paciente", "Chance", "Contato"], rows: [["Helvira Lindoval", "42%", "CPF 123.456.789-09, (81) 99999-1234, helvira@exemplo.test"]] },
  };

  it("nome do arquivo segue o padrão, sem acento nem espaço", () => {
    expect(exportFileName({ item: "Receita prevista", filters: { unidade: "Todas", periodo: "2026-11" } }, new Date(2026, 10, 3)))
      .toBe("analises-receita-prevista-todas-2026-11-2026-11-03.png");
    expect(exportFileName({ item: "faltas", filters: { unidade: "Boa Viagem", periodo: "Esta semana" } }, new Date(2026, 0, 9)))
      .toBe("analises-faltas-boa-viagem-esta-semana-2026-01-09.png");
  });

  it("nomes saem ocultos por padrão e só aparecem com a opção explícita", () => {
    expect(hasNames(risk)).toBe(true);
    const hidden = applyPrivacy(risk, false);
    expect(hidden.body.kind === "table" && hidden.body.rows[0][0]).toBe("#1 H. L.");
    const shown = applyPrivacy(risk, true);
    expect(shown.body.kind === "table" && shown.body.rows[0][0]).toBe("Helvira Lindoval");
    const answer = applyPrivacy({ ...risk, item: "risco-paciente", title: "Risco de falta · Helvira Lindoval", names: ["Helvira Lindoval"], body: { kind: "text", lines: ["Helvira Lindoval: 42%"] } }, false);
    expect(answer.title).toBe(`Risco de falta · ${initials("Helvira Lindoval")}`);
    expect(JSON.stringify(answer)).not.toContain("Helvira");
  });

  it("o desenho não contém CPF, telefone nem e-mail, nos dois temas", () => {
    for (const p of [pal("#ffffff"), pal("#1a2d35")]) {
      const { ctx, texts } = fakeCtx();
      let size = [0, 0];
      render(ctx, (w, h) => { size = [w, h]; }, applyPrivacy(risk, false), p, fonts, new Date(2026, 10, 3, 9, 5));
      const all = texts.join("\n");
      expect(all).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
      expect(all).not.toMatch(/9999-1234/);
      expect(all).not.toMatch(/@exemplo/);
      expect(all).not.toContain("Helvira");
      expect(all).toContain("Clínica Movimento • gerado em 03/11/2026 09:05 • Estimativa estatística com dados fictícios de demonstração");
      expect(size[0]).toBe(2400); // 1200 px × escala 2
      expect(size[1]).toBeGreaterThan(400);
    }
    expect(scrub("ligue 81 98888-7777")).toBe("ligue •••");
  });
});

describe("Assistente: perguntas sugeridas", async () => {
  const { autocomplete, followupsFor, readSize, starterNames, writeSize, SIZE_KEY } = await import("./assistente");

  it("nunca repete o que já foi perguntado (sem diferença de acento ou maiúscula) e devolve 3 a 4", () => {
    const asked = ["Previsão de faltas da próxima semana", "quais pacientes tem maior risco?"];
    const out = followupsFor("faltas_semana", { top: "Helvira Lindoval" }, asked);
    expect(out.length).toBeGreaterThanOrEqual(3);
    expect(out.length).toBeLessThanOrEqual(4);
    expect(out).not.toContain("Quais pacientes têm maior risco?");
    expect(out.some((q) => q.includes("Helvira Lindoval"))).toBe(true);
    const again = followupsFor("faltas_semana", { top: "Helvira Lindoval" }, [...asked, ...out]);
    expect(again.filter((q) => out.includes(q))).toEqual([]);
  });

  it("cada intenção tem seguimentos ligados ao assunto", () => {
    expect(followupsFor("perda_mes", {}, [])).toEqual(expect.arrayContaining(["Quanto eu recuperaria com lembretes?", "Qual unidade perde mais?", "Como reduzir as faltas da 6ª sessão?"]));
    expect(followupsFor("risco_paciente", { name: "Nevina Galvarim" }, [])).toEqual(expect.arrayContaining(["Qual ação você sugere para Nevina Galvarim?", "O que mais pesa no risco de Nevina Galvarim?"]));
  });

  it("os nomes sugeridos vêm só dos pacientes do sistema e nunca carregam CPF", () => {
    const rows = [{ name: "Helvira Lindoval", p: 0.2, cpf: "123.456.789-09" }, { name: "Isandro Fontarelo", p: 0.4, cpf: "98765432100" }];
    const s = starterNames(rows);
    expect(s.top).toBe("Isandro Fontarelo");
    expect(s.names).toEqual(["Isandro Fontarelo", "Helvira Lindoval"]);
    expect(JSON.stringify(s)).not.toMatch(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/);
    const sug = autocomplete("probabilidade da helv", s.names);
    expect(sug).toEqual(["Qual a probabilidade de Helvira Lindoval faltar?"]);
    expect(autocomplete("risco do isa", s.names)).toEqual(["Risco do paciente Isandro Fontarelo"]);
    expect(autocomplete("probabilidade de zz", s.names)).toEqual([]);
  });

  it("o tamanho escolhido persiste e armazenamento bloqueado não quebra", () => {
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    expect(readSize(store)).toBe("compacto");
    writeSize(store, "ampliado");
    expect(mem.get(SIZE_KEY)).toBe("ampliado");
    expect(readSize(store)).toBe("ampliado");
    const blocked = { getItem: () => { throw new Error("bloqueado"); }, setItem: () => { throw new Error("bloqueado"); } };
    expect(readSize(blocked)).toBe("compacto");
    expect(() => writeSize(blocked, "ampliado")).not.toThrow();
  });

  it("entende as perguntas de seguimento", () => {
    expect(parseQuestion("Qual a probabilidade de Helvira Lindoval faltar?")).toMatchObject({ intent: "risco_paciente", name: "helvira lindoval" });
    expect(parseQuestion("Qual ação você sugere para Helvira Lindoval?")).toMatchObject({ intent: "risco_paciente", focus: "acao", name: "helvira lindoval" });
    expect(parseQuestion("O que mais pesa no risco de Helvira Lindoval?")).toMatchObject({ intent: "risco_paciente", focus: "fatores" });
    expect(parseQuestion("Quanto eu recuperaria com lembretes?").intent).toBe("recuperar_lembretes");
    expect(parseQuestion("Qual unidade perde mais?").intent).toBe("unidade_perde");
    expect(parseQuestion("Quanto as faltas desta semana representam em dinheiro?").intent).toBe("dinheiro_semana");
    expect(parseQuestion("Quem são os próximos pacientes de risco?").intent).toBe("pacientes_risco");
  });
});
