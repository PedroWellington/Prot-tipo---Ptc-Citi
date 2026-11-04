import { describe, expect, it } from "vitest";
import { agendaScope, dayCapacity, foldMonth } from "./agenda";

const unit = { id: "u1", chairs: 2, openHour: 7, closeHour: 12, saturdayEnabled: false, satOpenHour: 8, satCloseHour: 12 };

describe("Mês da agenda", () => {
  it("soma as contagens por dia e status, atrasos e renovações", () => {
    const days = foldMonth([
      { day: "2026-11-05", status: "CONFIRMADA", n: 3, late: 1, renewal: 0 },
      { day: "2026-11-05", status: "FALTA", n: 2, late: 0, renewal: 1 },
      { day: "2026-11-06", status: "AGENDADA", n: 1, late: 0, renewal: 0 },
    ], () => 100);
    expect(days["2026-11-05"]).toEqual({ total: 5, status: { CONFIRMADA: 3, FALTA: 2 }, late: 1, renewal: 1, full: false });
    expect(days["2026-11-06"].total).toBe(1);
    expect(days["2026-11-07"]).toBeUndefined();
  });
  it("marca o dia como cheio a partir de 85% da capacidade (desmarcadas não ocupam)", () => {
    const d = foldMonth([{ day: "2026-11-05", status: "CONFIRMADA", n: 9, late: 0, renewal: 0 }, { day: "2026-11-05", status: "DESMARCADA", n: 5, late: 0, renewal: 0 }], () => 10);
    expect(d["2026-11-05"].full).toBe(true);
    expect(foldMonth([{ day: "2026-11-05", status: "CONFIRMADA", n: 8, late: 0, renewal: 0 }], () => 10)["2026-11-05"].full).toBe(false);
  });
  it("capacidade: cadeiras × horas abertas; domingo fechado; fisioterapeuta atende uma por hora", () => {
    expect(dayCapacity("2026-11-05", [unit], {})).toBe(10); // quinta, 7h às 12h
    expect(dayCapacity("2026-11-08", [unit], {})).toBe(0); // domingo
    expect(dayCapacity("2026-11-05", [unit], { physioId: "p1" })).toBe(5);
  });
});

describe("Permissões da agenda (dia, semana e mês)", () => {
  it("fisioterapeuta só vê os próprios pacientes, mesmo pedindo outra", () => {
    expect(agendaScope({ role: "FISIOTERAPEUTA", unitId: "u1", physio: { id: "p1" } }, { physioId: "p2" })).toEqual({ physioId: "p1" });
  });
  it("recepção fica na própria unidade", () => {
    expect(agendaScope({ role: "RECEPCAO", unitId: "u1", physio: null }, { unitId: "u2", status: "FALTA" })).toEqual({ unitId: "u1", status: "FALTA" });
  });
  it("admin vê tudo e paciente não entra", () => {
    expect(agendaScope({ role: "ADMIN", unitId: null, physio: null }, { unitId: "u2" })).toEqual({ unitId: "u2" });
    expect(() => agendaScope({ role: "PACIENTE", unitId: null, physio: null }, {})).toThrow();
    expect(() => agendaScope({ role: "FISIOTERAPEUTA", unitId: null, physio: null }, {})).toThrow();
  });
});
