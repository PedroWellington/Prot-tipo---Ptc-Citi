import { describe, expect, it } from "vitest";
import { formatCpfInput, hasCpfFormat, maskCpf } from "./cpf";
import { computeSessionMetrics, type MetricRow } from "./metrics";
import { attendance, phaseLabel, pickMessage, progressOf, stageOf } from "./progress";
import { freePhysiosAt, haversineKm, hourBand, hoursForDay, isPeakHour, planSessions, rescheduleBlock } from "./schedule";
import { UNIDADES } from "./unidades";
import { atRecife, dayKey, fmtRelative, HOUR, recifeParts } from "./time";

describe("CPF", () => {
  it("protótipo: aceita qualquer número de 11 dígitos, com ou sem máscara, mesmo com dígitos verificadores inválidos", () => {
    expect(hasCpfFormat("529.982.247-25")).toBe(true);
    expect(hasCpfFormat("529.982.247-24")).toBe(true);
    expect(hasCpfFormat("111.111.111-11")).toBe(true);
    expect(hasCpfFormat("12345678900")).toBe(true);
  });
  it("rejeita só o formato incompleto ou com dígitos a mais", () => {
    expect(hasCpfFormat("123")).toBe(false);
    expect(hasCpfFormat("529.982.247-2")).toBe(false);
    expect(hasCpfFormat("529982247251")).toBe(false);
    expect(hasCpfFormat("")).toBe(false);
  });
  it("mascara no formato da interface e formata a digitação", () => {
    expect(maskCpf("52998224725")).toBe("***.982.247-**");
    expect(formatCpfInput("52998224725")).toBe("529.982.247-25");
    expect(formatCpfInput("1234567890123")).toBe("123.456.789-01");
  });
});

describe("Progresso", () => {
  const msgs = [
    { sessionNumber: 5, totalSessions: 10, text: "padrao-5" },
    { sessionNumber: 3, totalSessions: 6, text: "especifico" },
  ];
  it("limita X ao intervalo 0..N", () => {
    expect(progressOf(12, 10)).toMatchObject({ done: 10, ratio: 1, finished: true });
    expect(progressOf(-1, 10)).toMatchObject({ done: 0, ratio: 0, finished: false });
  });
  it("prefere texto do total exato e cai no proporcional", () => {
    expect(pickMessage(msgs, 3, 6)).toBe("especifico");
    expect(pickMessage(msgs, 4, 8)).toBe("padrao-5");
  });
  it("marca a fase crítica nas sessões 5 e 6 de 10", () => {
    expect(phaseLabel(5, 10)).toBe("Fase crítica");
    expect(phaseLabel(6, 10)).toBe("Fase crítica");
    expect(phaseLabel(7, 10)).toBe("Consolidação");
  });
});

describe("Painel do paciente", () => {
  it("fase pelo avanço", () => {
    expect([0, 2, 3, 5, 6, 9, 10].map((d) => stageOf(d, 10))).toEqual([0, 1, 1, 2, 2, 3, 4]);
  });
  it("presença e sequência sem falta", () => {
    const st = (xs: string[]) => xs.map((status) => ({ status }));
    expect(attendance([])).toEqual({ presence: null, streak: 0, missed: 0 });
    expect(attendance(st(["REALIZADA", "FALTA", "REALIZADA", "DESMARCADA", "REALIZADA", "AGENDADA"]))).toEqual({ presence: 75, streak: 2, missed: 1 });
  });
});

describe("Agenda", () => {
  const unit = { openHour: 7, closeHour: 20, saturdayEnabled: false, satOpenHour: 8, satCloseHour: 12 };

  it("não abre domingo, sábado só quando habilitado, e fecha no almoço", () => {
    expect(hoursForDay(unit, 0)).toEqual([]);
    expect(hoursForDay(unit, 6)).toEqual([]);
    expect(hoursForDay({ ...unit, saturdayEnabled: true }, 6)).toEqual([8, 9, 10, 11]);
    expect(hoursForDay(unit, 1)).not.toContain(12);
  });

  it("planeja 10 sessões, 2 por semana, em ordem", () => {
    const dates = planSessions(
      [{ weekday: 1, hour: 10 }, { weekday: 4, hour: 10 }],
      atRecife(2026, 11, 2, 8), 10, () => true,
    );
    expect(dates).toHaveLength(10);
    expect(recifeParts(dates[0]).weekday).toBe(1);
    expect(recifeParts(dates[1]).weekday).toBe(4);
    expect(dates.every((d, i) => i === 0 || d > dates[i - 1])).toBe(true);
  });

  it("pula feriado e conflito sem perder sessões", () => {
    const blocked = dayKey(atRecife(2026, 11, 5));
    const dates = planSessions(
      [{ weekday: 1, hour: 10 }, { weekday: 4, hour: 10 }],
      atRecife(2026, 11, 2, 8), 10, (d) => dayKey(d) !== blocked,
    );
    expect(dates).toHaveLength(10);
    expect(dates.map(dayKey)).not.toContain(blocked);
  });

  it("não agenda antes de `from`", () => {
    const [first] = planSessions([{ weekday: 1, hour: 10 }], atRecife(2026, 11, 2, 11), 1, () => true);
    expect(dayKey(first)).toBe("2026-11-09");
  });

  it("detecta conflito por fisioterapeuta e por cadeiras", () => {
    const when = atRecife(2026, 11, 2, 10);
    const busy = [{ startsAt: when, physioId: "a" }];
    expect(freePhysiosAt(when, ["a", "b"], busy, 3)).toEqual(["b"]);
    expect(freePhysiosAt(when, ["a", "b"], busy, 1)).toEqual([]);
    expect(freePhysiosAt(atRecife(2026, 11, 2, 11), ["a"], busy, 1)).toEqual(["a"]);
  });

  it("identifica picos e faixas de horário", () => {
    expect([7, 8, 17, 19].every(isPeakHour)).toBe(true);
    expect([9, 16, 20].some(isPeakHour)).toBe(false);
    expect(hourBand(8)).toBe("7–9h");
    expect(hourBand(19)).toBe("17–20h");
  });

  it("aplica antecedência mínima e limite de trocas", () => {
    const now = atRecife(2026, 11, 2, 8);
    const base = { now, minHours: 2, used: 0, limit: 3 };
    expect(rescheduleBlock({ ...base, startsAt: atRecife(2026, 11, 2, 9) })).toMatch(/antecedência/);
    expect(rescheduleBlock({ ...base, startsAt: atRecife(2026, 11, 2, 11), used: 3 })).toMatch(/trocas/);
    expect(rescheduleBlock({ ...base, startsAt: atRecife(2026, 11, 2, 11) })).toBeNull();
  });

  it("calcula distância entre as unidades", () => {
    const km = haversineKm(UNIDADES[0], UNIDADES[1]);
    expect(km).toBeGreaterThan(11);
    expect(km).toBeLessThan(12);
  });

  it("guarda UTC e devolve o horário de Recife", () => {
    const d = atRecife(2026, 11, 2, 7);
    expect(d.toISOString()).toBe("2026-11-02T10:00:00.000Z");
    expect(recifeParts(d).hour).toBe(7);
  });
});

describe("Tempo relativo", () => {
  const now = atRecife(2026, 11, 2, 12).getTime();
  it("resume horas e dias", () => {
    expect(fmtRelative(new Date(now - 30_000), now)).toBe("agora");
    expect(fmtRelative(new Date(now - 3 * HOUR), now)).toBe("há 3h");
    expect(fmtRelative(new Date(now - 26 * HOUR), now)).toBe("ontem");
  });
});

describe("Métricas", () => {
  const row = (o: Partial<MetricRow>): MetricRow => ({
    status: "REALIZADA", number: 1, startsAt: atRecife(2026, 10, 1, 8), type: "PARTICULAR",
    unitCode: "BV", noticeHours: null, confirmedAt: null, ...o,
  });
  const rules = { lateCancelHours: 2, countLateCancelAsNoShow: false, baselineNoShowPct: 50, priceParticular: 110, priceConvenio: 55 };

  it("separa Falta, Desmarcação e Reagendamento", () => {
    const m = computeSessionMetrics(
      [row({}), row({ status: "FALTA" }), row({ status: "DESMARCADA", noticeHours: 24 }), row({ status: "REAGENDADA" })], rules,
    );
    expect(m.totals).toMatchObject({ realizadas: 1, faltas: 1, desmarcacoes: 1, reagendamentos: 1, tardias: 0 });
    expect(m.noShowRate).toBe(50);
  });

  it("conta atraso à parte, sem mudar a taxa de faltas", () => {
    const m = computeSessionMetrics([row({ lateAt: new Date() }), row({ status: "FALTA" })], rules);
    expect(m.totals.atrasos).toBe(1);
    expect(m.noShowRate).toBe(50);
  });

  it("contabiliza desmarcação tardia conforme a regra configurada", () => {
    const rows = [row({}), row({ status: "DESMARCADA", noticeHours: 1 })];
    expect(computeSessionMetrics(rows, rules).noShowRate).toBe(0);
    expect(computeSessionMetrics(rows, { ...rules, countLateCancelAsNoShow: true }).noShowRate).toBe(50);
  });

  it("mostra a taxa por número da sessão e tipo", () => {
    const rows = [
      row({ number: 6, type: "CONVENIO", status: "FALTA" }),
      row({ number: 6, type: "CONVENIO" }),
      row({ number: 6 }),
    ];
    const s6 = computeSessionMetrics(rows, rules).bySessionNumber[5];
    expect(s6).toMatchObject({ convenio: 50, particular: 0 });
  });

  it("estima receita recuperada contra a taxa de referência", () => {
    const rows = [row({}), row({}), row({}), row({ status: "FALTA" })]; // 25% contra referência de 50%
    expect(computeSessionMetrics(rows, rules).recoveredRevenue).toBe(110);
  });
});
