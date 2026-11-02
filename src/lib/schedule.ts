import { atRecife, DAY, HOUR, recifeParts } from "./time";

export type UnitHours = {
  openHour: number;
  closeHour: number;
  saturdayEnabled: boolean;
  satOpenHour: number;
  satCloseHour: number;
};

export type WeeklySlot = { weekday: number; hour: number };

const LUNCH_HOUR = 12;

/** Início dos atendimentos de 1h no dia da semana (0=domingo). Sem domingo; almoço fechado de seg a sex. */
export function hoursForDay(unit: UnitHours, weekday: number): number[] {
  if (weekday === 0) return [];
  if (weekday === 6 && !unit.saturdayEnabled) return [];
  const [from, to] = weekday === 6 ? [unit.satOpenHour, unit.satCloseHour] : [unit.openHour, unit.closeHour];
  const hours: number[] = [];
  for (let h = from; h < to; h++) if (weekday === 6 || h !== LUNCH_HOUR) hours.push(h);
  return hours;
}

export const isPeakHour = (hour: number) => (hour >= 7 && hour < 9) || (hour >= 17 && hour < 20);

export const HOUR_BANDS = ["7–9h", "9–12h", "13–17h", "17–20h"] as const;
export const hourBand = (hour: number) =>
  hour < 9 ? HOUR_BANDS[0] : hour < 13 ? HOUR_BANDS[1] : hour < 17 ? HOUR_BANDS[2] : HOUR_BANDS[3];

/** Próximos instantes (em ordem) que caem no padrão semanal, a partir de `from`. */
export function* weeklyOccurrences(pattern: WeeklySlot[], from: Date, maxWeeks = 26): Generator<Date> {
  const start = recifeParts(from);
  const day0 = atRecife(start.year, start.month, start.day);
  for (let i = 0; i < maxWeeks * 7; i++) {
    const p = recifeParts(new Date(day0.getTime() + i * DAY));
    const hours = pattern.filter((s) => s.weekday === p.weekday).map((s) => s.hour).sort((a, b) => a - b);
    for (const h of hours) {
      const when = atRecife(p.year, p.month, p.day, h);
      if (when > from) yield when;
    }
  }
}

/** Escolhe `total` datas do padrão, pulando as bloqueadas (feriado, conflito). Devolve menos se faltar agenda. */
export function planSessions(pattern: WeeklySlot[], from: Date, total: number, isFree: (d: Date) => boolean): Date[] {
  const dates: Date[] = [];
  for (const when of weeklyOccurrences(pattern, from)) {
    if (dates.length === total) break;
    if (isFree(when)) dates.push(when);
  }
  return dates;
}

/** Quanto custa e quantas sessões: pacote completo ou uma avulsa. */
export const BOOKING_SIZES = { pacote: 10, avulsa: 1 } as const;

export type BusySlot = { startsAt: Date; physioId: string };

/** Fisioterapeutas livres no instante, respeitando cadeiras da unidade. Vazio = horário indisponível. */
export function freePhysiosAt(when: Date, physioIds: string[], busy: BusySlot[], chairs: number): string[] {
  const at = busy.filter((b) => b.startsAt.getTime() === when.getTime());
  if (at.length >= chairs) return [];
  const taken = new Set(at.map((b) => b.physioId));
  return physioIds.filter((id) => !taken.has(id));
}

export type RescheduleCheck = { startsAt: Date; now: Date; minHours: number; used: number; limit: number };

/** Devolve a mensagem de bloqueio, ou null se a troca é permitida. */
export function rescheduleBlock({ startsAt, now, minHours, used, limit }: RescheduleCheck): string | null {
  if (startsAt.getTime() - now.getTime() < minHours * HOUR)
    return `Trocas precisam ser pedidas com pelo menos ${minHours}h de antecedência.`;
  if (used >= limit) return `Você já usou as ${limit} trocas disponíveis neste tratamento. Fale com a recepção.`;
  return null;
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}
