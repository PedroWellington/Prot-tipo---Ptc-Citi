import { describe, expect, it } from "vitest";
import { EVENT_TITLE, googleCalendarUrl, icsFile, monthCells, shiftMonth } from "./calendar";
import { atRecife } from "./time";

const event = { id: "s1", startsAt: atRecife(2026, 11, 5, 14), place: "Clínica Movimento - Boa Viagem, Av. Exemplo, 100" };

describe("Grade do mês", () => {
  it("começa na segunda e fecha semanas inteiras", () => {
    const cells = monthCells("2026-11"); // 1º de novembro de 2026 é domingo
    expect(cells.length % 7).toBe(0);
    expect(cells.slice(0, 6).every((c) => c === null)).toBe(true);
    expect(cells[6]?.day).toBe(1);
    expect(cells.filter(Boolean)).toHaveLength(30);
  });
  it("troca de ano ao andar os meses", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
});

describe("Adicionar ao Google Agenda (paciente)", () => {
  it("link padrão do Google com título, horário em UTC e endereço público", () => {
    const u = new URL(googleCalendarUrl(event));
    expect(u.origin + u.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(u.searchParams.get("action")).toBe("TEMPLATE");
    expect(u.searchParams.get("text")).toBe("Sessão de fisioterapia - Clínica Movimento");
    expect(u.searchParams.get("dates")).toBe("20261105T170000Z/20261105T180000Z"); // 14h em Recife = 17h UTC
    expect(u.searchParams.get("location")).toBe(event.place);
  });
  it(".ics com o mesmo evento e lembrete de 1 hora antes", () => {
    const ics = icsFile(event, new Date("2026-11-04T12:00:00Z"));
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain(`SUMMARY:${EVENT_TITLE}`);
    expect(ics).toContain("DTSTART:20261105T170000Z");
    expect(ics).toContain("DTEND:20261105T180000Z");
    expect(ics).toContain("TRIGGER:-PT1H");
    expect(ics).toContain("LOCATION:Clínica Movimento - Boa Viagem\\, Av. Exemplo\\, 100");
    expect(ics.split("\r\n").length).toBeGreaterThan(10);
  });
  it("sem CPF, telefone, e-mail ou observações", () => {
    for (const text of [googleCalendarUrl(event), icsFile(event)]) {
      const plain = decodeURIComponent(text);
      expect(plain).not.toMatch(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/);
      expect(plain).not.toMatch(/@[\w-]+\./);
      expect(plain).not.toMatch(/\(?\d{2}\)?\s?9?\d{4}-?\d{4}/);
      expect(plain.toLowerCase()).not.toMatch(/dor|observa|convênio|cpf|telefone/);
    }
  });
});
