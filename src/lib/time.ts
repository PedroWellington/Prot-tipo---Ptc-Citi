// shortcut: Recife é UTC-3 fixo (Brasil sem horário de verão desde 2019); troque por biblioteca de fuso se isso mudar
const OFFSET_H = 3;
const TZ = "America/Recife";
export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

export const atRecife = (y: number, m: number, d: number, h = 0) => new Date(Date.UTC(y, m - 1, d, h + OFFSET_H));

export function recifeParts(date: Date) {
  const l = new Date(date.getTime() - OFFSET_H * HOUR);
  return {
    year: l.getUTCFullYear(),
    month: l.getUTCMonth() + 1,
    day: l.getUTCDate(),
    hour: l.getUTCHours(),
    weekday: l.getUTCDay(),
  };
}

export const startOfRecifeDay = (date: Date) => {
  const p = recifeParts(date);
  return atRecife(p.year, p.month, p.day);
};

export const dayKey = (date: Date) => {
  const p = recifeParts(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
};

const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, ...o });
const dateF = fmt({ day: "2-digit", month: "2-digit" });
const longF = fmt({ weekday: "long", day: "numeric", month: "long" });
const shortWeekF = fmt({ weekday: "short", day: "2-digit", month: "2-digit" });
const timeF = fmt({ hour: "2-digit", minute: "2-digit" });
const stampF = fmt({ day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export const fmtDate = (d: Date | string) => dateF.format(new Date(d));
export const fmtLong = (d: Date | string) => longF.format(new Date(d));
export const fmtWeekShort = (d: Date | string) => shortWeekF.format(new Date(d)).replace(/\.,?/g, "");
export const fmtTime = (d: Date | string) => timeF.format(new Date(d));
export const fmtStamp = (d: Date | string) => stampF.format(new Date(d));

export const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const WEEKDAYS_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function countdown(target: Date | string, now = Date.now()): string {
  const ms = new Date(target).getTime() - now;
  if (ms <= 0) return "agora";
  const h = Math.floor(ms / HOUR);
  if (h >= 48) return `em ${Math.floor(h / 24)} dias`;
  if (h >= 24) return "em 1 dia";
  if (h >= 1) return `em ${h}h${String(Math.floor((ms % HOUR) / 60000)).padStart(2, "0")}`;
  return `em ${Math.max(1, Math.floor(ms / 60000))} min`;
}

export function fmtRelative(date: Date | string, now = Date.now()): string {
  const min = Math.floor((now - new Date(date).getTime()) / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "ontem" : d < 7 ? `há ${d} dias` : fmtDate(date);
}
