import { Prisma } from "@prisma/client";
import { monthRange } from "@/lib/calendar";
import { hoursForDay, type UnitHours } from "@/lib/schedule";
import { dayKey } from "@/lib/time";
import type { CurrentUser } from "../auth/session";
import { prisma } from "../db";
import { forbidden } from "../errors";
import { listUnits } from "../repositories/config";

export type AgendaFilters = { unitId?: string; physioId?: string; status?: string; q?: string };

/** Mesma regra para dia, semana e mês: fisioterapeuta só vê os próprios pacientes; recepção, a própria unidade; admin, tudo. */
export function agendaScope(user: Pick<CurrentUser, "role" | "unitId" | "physio">, f: AgendaFilters): AgendaFilters {
  if (user.role === "FISIOTERAPEUTA") {
    if (!user.physio) throw forbidden();
    return { ...f, physioId: user.physio.id };
  }
  if (user.role === "RECEPCAO" && user.unitId) return { ...f, unitId: user.unitId };
  if (user.role === "PACIENTE") throw forbidden();
  return f;
}

export type DayCount = { total: number; status: Record<string, number>; late: number; renewal: number; full: boolean };
type Row = { day: string; status: string; n: number; late: number; renewal: number };

/** Junta as linhas (dia × status) do banco em um resumo por dia. "Cheio" = 85% ou mais da capacidade. */
export function foldMonth(rows: Row[], capacity: (day: string) => number): Record<string, DayCount> {
  const out: Record<string, DayCount> = {};
  for (const r of rows) {
    const d = (out[r.day] ??= { total: 0, status: {}, late: 0, renewal: 0, full: false });
    d.total += r.n;
    d.status[r.status] = (d.status[r.status] ?? 0) + r.n;
    d.late += r.late;
    d.renewal += r.renewal;
  }
  for (const [day, d] of Object.entries(out)) {
    const cap = capacity(day);
    const busy = d.total - (d.status.DESMARCADA ?? 0);
    d.full = cap > 0 && busy >= cap * 0.85;
  }
  return out;
}

/** Atendimentos possíveis no dia: cadeiras × horas abertas (fisioterapeuta: 1 por hora). */
export function dayCapacity(day: string, units: (UnitHours & { id: string; chairs: number })[], f: AgendaFilters) {
  const [y, m, d] = day.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const scoped = f.unitId ? units.filter((u) => u.id === f.unitId) : units;
  if (f.physioId) return Math.max(0, ...scoped.map((u) => hoursForDay(u, weekday).length));
  return scoped.reduce((a, u) => a + hoursForDay(u, weekday).length * u.chairs, 0);
}

/** Uma consulta agregada por mês: contagens por dia e status, sem carregar sessão por sessão. */
export async function monthAgenda(ym: string, f: AgendaFilters) {
  const { start, end } = monthRange(ym);
  const w = [Prisma.sql`s."startsAt" >= ${start} AND s."startsAt" < ${end}`];
  w.push(f.status ? Prisma.sql`s."status"::text = ${f.status}` : Prisma.sql`s."status" <> 'REAGENDADA'`);
  if (f.unitId) w.push(Prisma.sql`s."unitId" = ${f.unitId}`);
  if (f.physioId) w.push(Prisma.sql`s."physioId" = ${f.physioId}`);
  if (f.q) w.push(Prisma.sql`u."name" ILIKE ${`%${f.q.replace(/[%_\\]/g, "\\$&")}%`}`);
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT to_char(s."startsAt" - interval '3 hours', 'YYYY-MM-DD') AS "day", s."status"::text AS "status",
      count(*)::int AS "n",
      count(*) FILTER (WHERE s."lateAt" IS NOT NULL)::int AS "late",
      count(*) FILTER (WHERE s."provisional")::int AS "renewal"
    FROM "Session" s
    JOIN "PatientProfile" p ON p."id" = s."patientId"
    JOIN "User" u ON u."id" = p."userId"
    WHERE ${Prisma.join(w, " AND ")}
    GROUP BY 1, 2`;
  const units = await listUnits();
  return { month: ym, days: foldMonth(rows, (day) => dayCapacity(day, units, f)), today: dayKey(new Date()) };
}
