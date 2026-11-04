import { atRecife, DAY, recifeParts } from "./time";

// ── Grade do mês (segunda a domingo) ─────────────────────────

export const ymOf = (d: Date) => { const p = recifeParts(d); return `${p.year}-${String(p.month).padStart(2, "0")}`; };
export const shiftMonth = (ym: string, by: number) => {
  const [y, m] = ym.split("-").map(Number);
  const i = y * 12 + (m - 1) + by;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
};
export const monthRange = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  const start = atRecife(y, m, 1);
  const end = m === 12 ? atRecife(y + 1, 1, 1) : atRecife(y, m + 1, 1);
  return { start, end };
};

/** Células do calendário: começa na segunda anterior ao dia 1 e completa semanas inteiras. null = fora do mês. */
export function monthCells(ym: string): ({ key: string; day: number; at: number } | null)[] {
  const { start, end } = monthRange(ym);
  const lead = (recifeParts(start).weekday + 6) % 7;
  const days = Math.round((end.getTime() - start.getTime()) / DAY);
  const cells: ({ key: string; day: number; at: number } | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) cells.push({ key: `${ym}-${String(d).padStart(2, "0")}`, day: d, at: start.getTime() + (d - 1) * DAY });
  while (cells.length % 7) cells.push(null);
  return cells;
}

export const MONTH_NAMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const monthTitle = (ym: string) => { const [y, m] = ym.split("-").map(Number); return `${MONTH_NAMES[m - 1]} de ${y}`; };

// ── "Adicionar ao Google Agenda" do paciente (sem OAuth) ─────

export const EVENT_TITLE = "Sessão de fisioterapia - Clínica Movimento";
export const SESSION_MINUTES = 60;

/** Só data, hora e endereço público: nada de CPF, telefone, e-mail ou observação clínica. */
export type PublicEvent = { id: string; startsAt: Date | string; place: string };

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function googleCalendarUrl(e: PublicEvent) {
  const start = new Date(e.startsAt), end = new Date(start.getTime() + SESSION_MINUTES * 60_000);
  const q = new URLSearchParams({
    action: "TEMPLATE", text: EVENT_TITLE, dates: `${stamp(start)}/${stamp(end)}`, location: e.place,
    // O link do Google não aceita lembrete; o arquivo .ics leva o de 1 hora
    details: "Chegue 10 minutos antes. Para trocar o horário, use o app da clínica.",
    ctz: "America/Sao_Paulo",
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}

const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

export function icsFile(e: PublicEvent, now = new Date()) {
  const start = new Date(e.startsAt), end = new Date(start.getTime() + SESSION_MINUTES * 60_000);
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Clinica Movimento//Agenda//PT-BR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.id}@clinica-movimento`, `DTSTAMP:${stamp(now)}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:${icsText(EVENT_TITLE)}`, `LOCATION:${icsText(e.place)}`,
    "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsText(EVENT_TITLE)}`, "TRIGGER:-PT1H", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR", "",
  ].join("\r\n");
}

export function downloadIcs(e: PublicEvent) {
  const url = URL.createObjectURL(new Blob([icsFile(e)], { type: "text/calendar;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "sessao-fisioterapia.ics" });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
