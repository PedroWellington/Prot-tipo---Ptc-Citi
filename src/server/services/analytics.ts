import type { Prisma } from "@prisma/client";
import {
  accuracy, auc, breakdown, buildRateModel, clampNumber, dailySeries, mape, monthForecast, PEAK_BANDS, patientRisk,
  type FutureSession, type HistRow, type PatientHistory, type PatientType, type RateModel, type SimSession,
} from "@/lib/previsao";
import { HOUR_BANDS, hourBand } from "@/lib/schedule";
import { atRecife, DAY, fmtLong, fmtTime, recifeParts, WEEKDAYS } from "@/lib/time";
import type { CurrentUser } from "../auth/session";
import { prisma } from "../db";
import { notFound } from "../errors";
import { audit, getSettings, listUnits } from "../repositories/config";
import { notify } from "./notifications";
import { sendWhatsApp } from "./whatsapp";

const TTL = 5 * 60_000;
const memo = new Map<string, { at: number; value: Promise<unknown> }>();
/** Cache curto por processo: o painel e o assistente fazem a mesma conta várias vezes em poucos minutos. */
function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value as Promise<T>;
  const value = load().catch((e) => { memo.delete(key); throw e; });
  memo.set(key, { at: Date.now(), value });
  return value;
}

type Row = {
  id: string; patientId: string; status: string; number: number; startsAt: Date; noticeHours: number | null;
  confirmedAt: Date | null; lateAt: Date | null; type: PatientType; unit: string;
};

/** Histórico em uma consulta: só colunas de atendimento, nada de dado pessoal. */
const history = (from: Date, to: Date) =>
  prisma.$queryRaw<Row[]>`
    SELECT s."id", s."patientId", s."status", s."number", s."startsAt", s."noticeHours", s."confirmedAt", s."lateAt", p."type", u."code" AS "unit"
    FROM "Session" s JOIN "PatientProfile" p ON p."id" = s."patientId" JOIN "Unit" u ON u."id" = s."unitId"
    WHERE s."startsAt" >= ${from} AND s."startsAt" < ${to} AND s."status" IN ('REALIZADA', 'FALTA', 'DESMARCADA')
    ORDER BY s."startsAt"`;

const toHist = (r: Row): HistRow => ({ type: r.type, number: r.number, band: hourBand(recifeParts(r.startsAt).hour), unit: r.unit, missed: r.status === "FALTA" });
const attended = (r: Row) => r.status === "REALIZADA" || r.status === "FALTA";

function modelAt(rows: Row[], until: Date, days: number) {
  const from = until.getTime() - days * DAY;
  const used = rows.filter((r) => attended(r) && r.startsAt.getTime() >= from && r.startsAt < until);
  return { model: buildRateModel(used.map(toHist)), used };
}

/** Sessões ainda por vir que entram na previsão: fora as de pagamento pendente ou reserva vencida. */
const futureWhere = (from: Date, to: Date, unitId?: string): Prisma.SessionWhereInput => ({
  status: { in: ["AGENDADA", "CONFIRMADA"] }, startsAt: { gte: from, lt: to },
  OR: [{ paymentId: null }, { payment: { status: "PAGO" } }],
  ...(unitId ? { unitId } : {}),
});

const futureSelect = {
  id: true, number: true, startsAt: true, status: true, provisional: true, patientId: true,
  unit: { select: { code: true, name: true } },
  patient: { select: { type: true, user: { select: { name: true } } } },
} satisfies Prisma.SessionSelect;
type FutureRow = Prisma.SessionGetPayload<{ select: typeof futureSelect }>;

function toFuture(s: FutureRow, model: RateModel, price: (t: PatientType) => number): FutureSession & { rate: number; basis: string; n: number } {
  const p = recifeParts(s.startsAt);
  const band = hourBand(p.hour);
  // Renovação pendente: a sessão herda a falta da 6ª sessão de convênio, o ponto em que o convênio trava
  const seg = { type: s.patient.type, number: s.provisional && s.patient.type === "CONVENIO" ? 6 : s.number, band, unit: s.unit.code };
  const r = model.rateFor(seg);
  return {
    id: s.id, value: price(s.patient.type), p: 1 - r.rate, rate: r.rate, basis: r.level, n: r.n, day: p.day, unit: s.unit.code,
    type: s.patient.type, band, number: clampNumber(s.number), confirmed: s.status === "CONFIRMADA", renewalPending: s.provisional,
  };
}

const monthBounds = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  const start = atRecife(y, m, 1), end = m === 12 ? atRecife(y + 1, 1, 1) : atRecife(y, m + 1, 1);
  return { start, end, days: Math.round((end.getTime() - start.getTime()) / DAY) };
};
export const currentMonth = () => { const p = recifeParts(new Date()); return `${p.year}-${String(p.month).padStart(2, "0")}`; };
const typeLabel = (t: string) => (t === "CONVENIO" ? "Convênio" : "Particular");

/** Aba Financeiro: receita realizada, prevista e perda do mês, com faixa por Monte Carlo. */
export function financeiro(ym: string, unitId: string | undefined, historyDays: number) {
  return cached(`fin:${ym}:${unitId}:${historyDays}`, async () => {
    const t0 = performance.now();
    const now = new Date();
    const { start, end, days } = monthBounds(ym);
    const [cfg, units, rows] = await Promise.all([getSettings(), listUnits(), history(new Date(Math.min(now.getTime(), end.getTime()) - historyDays * DAY), end)]);
    const unitCode = unitId ? units.find((u) => u.id === unitId)?.code : undefined;
    const price = (t: PatientType) => (t === "CONVENIO" ? cfg.price_convenio : cfg.price_particular);
    const { model, used } = modelAt(rows, now < end ? now : end, historyDays);

    const inMonth = rows.filter((r) => r.startsAt >= start && r.startsAt < end && r.startsAt <= now && (!unitCode || r.unit === unitCode));
    const realizedByDay: number[] = [];
    let realized = 0, pastLoss = 0, realizedCount = 0;
    const pastLosses: { r: Row; loss: number }[] = [];
    for (const r of inMonth) {
      const v = price(r.type);
      if (r.status === "REALIZADA") {
        realized += v;
        realizedCount++;
        const d = recifeParts(r.startsAt).day;
        realizedByDay[d] = (realizedByDay[d] ?? 0) + v;
      } else if (r.status === "FALTA" || (r.status === "DESMARCADA" && r.noticeHours !== null && r.noticeHours < cfg.late_cancel_hours)) {
        pastLoss += v;
        pastLosses.push({ r, loss: v });
      }
    }

    const futureRows = end > now ? await prisma.session.findMany({ where: futureWhere(now > start ? now : start, end, unitId), select: futureSelect, orderBy: { startsAt: "asc" } }) : [];
    const future = futureRows.map((s) => toFuture(s, model, price));
    const forecast = monthForecast({ realized, pastLoss, future });
    const today = now < start ? 0 : now >= end ? days : recifeParts(now).day;

    const by = <K extends string>(keyF: (s: (typeof future)[number]) => K, keyP: (r: Row) => K) =>
      breakdown(future, pastLosses.map(({ r, loss }) => ({ key: keyP(r), loss })), keyF);
    const unitName = (code: string) => units.find((u) => u.code === code)?.name ?? code;
    const offPeak = (s: (typeof future)[number]) => model.rateFor({ type: s.type, number: s.number, band: HOUR_BANDS[1], unit: s.unit }).rate;
    const rate6 = (s: (typeof future)[number]) => (s.type === "CONVENIO" ? model.rateFor({ type: "CONVENIO", number: 6, band: s.band, unit: s.unit }).rate : null);

    const months = new Set(used.map((r) => `${recifeParts(r.startsAt).year}-${recifeParts(r.startsAt).month}`)).size;
    return {
      month: ym, days, today, past: end <= now, futureOnly: start > now,
      cards: { ...forecast, realizedCount },
      daily: dailySeries(days, today, realizedByDay, future),
      breakdowns: {
        unidade: by((s) => unitName(s.unit), (r) => unitName(r.unit)),
        tipo: by((s) => typeLabel(s.type), (r) => typeLabel(r.type)),
        faixa: by((s) => s.band, (r) => hourBand(recifeParts(r.startsAt).hour)),
        sessao: by((s) => `${s.number}ª`, (r) => `${clampNumber(r.number)}ª`).sort((a, b) => parseInt(a.key) - parseInt(b.key)),
      },
      risks: [...future].sort((a, b) => a.p - b.p).slice(0, 10).map((s) => {
        const row = futureRows.find((f) => f.id === s.id)!;
        return {
          id: s.id, startsAt: row.startsAt, unit: unitName(s.unit), type: typeLabel(s.type), number: s.number, band: s.band,
          p: s.p, atRisk: s.value * (1 - s.p), patientId: row.patientId,
          action: s.renewalPending ? "Antecipar a renovação do convênio" : !s.confirmed ? "Confirmar por mensagem" : PEAK_BANDS.includes(s.band) ? "Oferecer outro horário" : "Colocar na lista de espera",
        };
      }),
      sim: future.map((s): SimSession => ({
        value: s.value, rate: s.rate, rate6: rate6(s), rateOffPeak: offPeak(s), peak: PEAK_BANDS.includes(s.band),
        conv6: s.type === "CONVENIO" && (s.number === 6 || s.renewalPending), confirmed: s.confirmed,
      })),
      prices: { particular: cfg.price_particular, convenio: cfg.price_convenio },
      seal: { months, sessions: used.length, historyDays },
      ms: Math.round(performance.now() - t0),
    };
  });
}

/** Histórico de comportamento por paciente, só do atendimento. */
async function histories(patientIds: string[], before: Date, lateCancelHours: number) {
  const [sessions, lates, requests] = await Promise.all([
    prisma.session.findMany({
      where: { patientId: { in: patientIds }, startsAt: { lt: before }, status: { in: ["REALIZADA", "FALTA", "DESMARCADA"] } },
      select: { patientId: true, status: true, noticeHours: true, confirmedAt: true, startsAt: true }, orderBy: { startsAt: "asc" },
    }),
    prisma.lateEvent.groupBy({ by: ["sessionId"], where: { session: { patientId: { in: patientIds } } }, _count: true }).then(async (g) =>
      g.length ? prisma.session.findMany({ where: { id: { in: g.map((x) => x.sessionId) } }, select: { patientId: true } }) : []),
    prisma.rescheduleRequest.groupBy({ by: ["patientId"], where: { patientId: { in: patientIds } }, _count: true }),
  ]);
  const out = new Map<string, PatientHistory>();
  for (const id of patientIds) out.set(id, { done: 0, missed: 0, lateCancels: 0, lates: 0, reschedules: 0, streak: 0, lastMissed: false, confirmedRate: null });
  const confirmed = new Map<string, [number, number]>();
  for (const s of sessions) {
    const h = out.get(s.patientId)!;
    if (s.status === "REALIZADA") { h.done++; h.streak++; h.lastMissed = false; }
    if (s.status === "FALTA") { h.missed++; h.streak = 0; h.lastMissed = true; }
    if (s.status === "DESMARCADA" && s.noticeHours !== null && s.noticeHours < lateCancelHours) h.lateCancels++;
    if (s.status !== "DESMARCADA") {
      const c = confirmed.get(s.patientId) ?? [0, 0];
      c[1]++;
      if (s.confirmedAt) c[0]++;
      confirmed.set(s.patientId, c);
    }
  }
  for (const l of lates) out.get(l.patientId)!.lates++;
  for (const r of requests) out.get(r.patientId)!.reschedules = r._count;
  for (const [id, [c, n]] of confirmed) out.get(id)!.confirmedRate = n ? c / n : null;
  return out;
}

const weekStart = (d: Date) => {
  const p = recifeParts(d);
  return new Date(atRecife(p.year, p.month, p.day).getTime() - ((p.weekday + 6) % 7) * DAY); // segunda-feira
};

/** Aba Previsões: faltas esperadas na semana e no mês, e risco por paciente na próxima sessão. */
export function previsoes(unitId: string | undefined, semana: "atual" | "proxima", historyDays: number) {
  return cached(`prev:${unitId}:${semana}:${historyDays}`, async () => {
    const now = new Date();
    const [cfg, units] = await Promise.all([getSettings(), listUnits()]);
    const rows = await history(new Date(now.getTime() - historyDays * DAY), now);
    const { model, used } = modelAt(rows, now, historyDays);
    const price = (t: PatientType) => (t === "CONVENIO" ? cfg.price_convenio : cfg.price_particular);
    const ws = weekStart(now);
    const wFrom = semana === "atual" ? now : new Date(ws.getTime() + 7 * DAY);
    const wTo = new Date(ws.getTime() + (semana === "atual" ? 7 : 14) * DAY);
    const { end: mEnd } = monthBounds(currentMonth());
    const horizon = new Date(Math.max(wTo.getTime(), mEnd.getTime()));
    const rowsF = await prisma.session.findMany({ where: futureWhere(now, horizon, unitId), select: futureSelect, orderBy: { startsAt: "asc" } });
    const all = rowsF.map((s) => ({ row: s, f: toFuture(s, model, price) }));
    const unitName = (code: string) => units.find((u) => u.code === code)?.name ?? code;

    const summarize = (list: typeof all) => {
      const exp = list.reduce((a, x) => a + (1 - x.f.p), 0);
      const sd = Math.sqrt(list.reduce((a, x) => a + x.f.p * (1 - x.f.p), 0));
      const group = (key: (x: (typeof all)[number]) => string, order?: string[]) => {
        const m = new Map<string, { key: string; sessions: number; expected: number }>();
        for (const x of list) {
          const k = key(x);
          const g = m.get(k) ?? { key: k, sessions: 0, expected: 0 };
          g.sessions++;
          g.expected += 1 - x.f.p;
          m.set(k, g);
        }
        const out = [...m.values()].map((g) => ({ ...g, rate: g.sessions ? g.expected / g.sessions : 0 }));
        return order ? order.filter((k) => m.has(k)).map((k) => out.find((g) => g.key === k)!) : out.sort((a, b) => b.expected - a.expected);
      };
      return {
        sessions: list.length, expected: exp, p80: [Math.max(0, exp - 1.2816 * sd), exp + 1.2816 * sd] as [number, number],
        rate: list.length ? exp / list.length : 0,
        byUnit: group((x) => unitName(x.f.unit)),
        byWeekday: group((x) => WEEKDAYS[recifeParts(x.row.startsAt).weekday], WEEKDAYS),
        byBand: group((x) => x.f.band, [...HOUR_BANDS]),
      };
    };
    const week = all.filter((x) => x.row.startsAt >= wFrom && x.row.startsAt < wTo);
    const month = all.filter((x) => x.row.startsAt < mEnd);

    // Próxima sessão de cada paciente, dentro da semana escolhida
    const nextByPatient = new Map<string, (typeof all)[number]>();
    for (const x of week) if (!nextByPatient.has(x.row.patientId)) nextByPatient.set(x.row.patientId, x);
    const hist = await histories([...nextByPatient.keys()], now, cfg.late_cancel_hours);
    const patients = [...nextByPatient.values()].map(({ row, f }) => {
      const r = patientRisk(f.rate, hist.get(row.patientId)!, { type: f.type, number: f.number, band: f.band, confirmed: f.confirmed, renewalPending: f.renewalPending });
      return {
        patientId: row.patientId, sessionId: row.id, name: row.patient.user.name, unit: unitName(f.unit), startsAt: row.startsAt,
        type: typeLabel(f.type), number: f.number, segmentRate: f.rate, ...r,
      };
    }).sort((a, b) => b.p - a.p);

    const months = new Set(used.map((r) => `${recifeParts(r.startsAt).year}-${recifeParts(r.startsAt).month}`)).size;
    return {
      week: { from: wFrom, to: wTo, ...summarize(week) },
      month: { to: mEnd, ...summarize(month) },
      topSessions: [...week].sort((a, b) => a.f.p - b.f.p).slice(0, 8).map(({ row, f }) => ({
        id: row.id, startsAt: row.startsAt, unit: unitName(f.unit), type: typeLabel(f.type), number: f.number, band: f.band, risk: 1 - f.p, basis: f.basis, n: f.n,
      })),
      patients,
      seal: { months, sessions: used.length, historyDays },
    };
  });
}

/** Consultar risco por paciente fica no log de auditoria (quem consultou e quando). */
export async function previsoesAudited(user: CurrentUser, unitId: string | undefined, semana: "atual" | "proxima", historyDays: number) {
  const data = await previsoes(unitId, semana, historyDays);
  await audit(user.id, "RISCO_PACIENTES_CONSULTADO", "Analytics", null, { unitId: unitId ?? "todas", semana, pacientes: data.patients.length });
  return data;
}

/**
 * Backtest: para cada semana e mês passados, treina o modelo só com o que existia antes do início do período
 * e compara o previsto com o que aconteceu.
 */
export function backtest() {
  return cached("backtest", async () => {
    const now = new Date();
    const cfg = await getSettings();
    const rows = await history(new Date(now.getTime() - 400 * DAY), now);
    const price = (t: PatientType) => (t === "CONVENIO" ? cfg.price_convenio : cfg.price_particular);
    const ws = weekStart(now);
    const periods: { label: string; kind: "semana" | "mes"; from: Date; to: Date }[] = [];
    for (let i = 8; i >= 1; i--) {
      const from = new Date(ws.getTime() - i * 7 * DAY);
      const p = recifeParts(from);
      periods.push({ label: `${String(p.day).padStart(2, "0")}/${String(p.month).padStart(2, "0")}`, kind: "semana", from, to: new Date(from.getTime() + 7 * DAY) });
    }
    const cur = recifeParts(now);
    for (let i = 4; i >= 1; i--) {
      const m = ((cur.month - 1 - i) % 12 + 12) % 12 + 1, y = cur.year + Math.floor((cur.month - 1 - i) / 12);
      const { start, end } = monthBounds(`${y}-${String(m).padStart(2, "0")}`);
      periods.push({ label: `${String(m).padStart(2, "0")}/${y}`, kind: "mes", from: start, to: end });
    }
    const results = periods.map((per) => {
      const { model } = modelAt(rows, per.from, 180);
      const inP = rows.filter((r) => attended(r) && r.startsAt >= per.from && r.startsAt < per.to);
      const exp = inP.map((r) => model.rateFor({ type: r.type, number: r.number, band: hourBand(recifeParts(r.startsAt).hour), unit: r.unit }).rate);
      return {
        ...per, sessions: inP.length,
        predictedMisses: exp.reduce((a, b) => a + b, 0), actualMisses: inP.filter((r) => r.status === "FALTA").length,
        predictedRevenue: inP.reduce((a, r, i) => a + price(r.type) * (1 - exp[i]), 0),
        actualRevenue: inP.filter((r) => r.status === "REALIZADA").reduce((a, r) => a + price(r.type), 0),
      };
    });

    // Por paciente, nas últimas 8 semanas: risco com o histórico do próprio paciente até a véspera de cada sessão
    const from = periods[0].from;
    const { model } = modelAt(rows, from, 180);
    const byPatient = new Map<string, Row[]>();
    for (const r of rows) (byPatient.get(r.patientId) ?? byPatient.set(r.patientId, []).get(r.patientId)!).push(r);
    const scores: number[] = [], labels: boolean[] = [], segScores: number[] = [];
    for (const list of byPatient.values()) {
      const h: PatientHistory = { done: 0, missed: 0, lateCancels: 0, lates: 0, reschedules: 0, streak: 0, lastMissed: false, confirmedRate: null };
      for (const r of list) {
        if (r.startsAt >= from && attended(r)) {
          const seg = model.rateFor({ type: r.type, number: r.number, band: hourBand(recifeParts(r.startsAt).hour), unit: r.unit }).rate;
          const risk = patientRisk(seg, { ...h }, { type: r.type, number: r.number, band: hourBand(recifeParts(r.startsAt).hour), confirmed: false, renewalPending: false });
          scores.push(risk.p);
          segScores.push(seg);
          labels.push(r.status === "FALTA");
        }
        if (r.status === "REALIZADA") { h.done++; h.streak++; h.lastMissed = false; }
        if (r.status === "FALTA") { h.missed++; h.streak = 0; h.lastMissed = true; }
        if (r.status === "DESMARCADA" && r.noticeHours !== null && r.noticeHours < cfg.late_cancel_hours) h.lateCancels++;
        if (r.lateAt) h.lates++;
      }
    }
    const weeks = results.filter((r) => r.kind === "semana"), monthsR = results.filter((r) => r.kind === "mes");
    const pick = (xs: typeof results, k: "Misses" | "Revenue") => mape(xs.map((x) => x[`predicted${k}`]), xs.map((x) => x[`actual${k}`]));
    return {
      periods: results,
      mape: { faltasSemana: pick(weeks, "Misses"), faltasMes: pick(monthsR, "Misses"), receitaSemana: pick(weeks, "Revenue"), receitaMes: pick(monthsR, "Revenue") },
      patient: {
        sessions: scores.length, missRate: labels.length ? labels.filter(Boolean).length / labels.length : 0,
        auc: auc(scores, labels), aucSegmentOnly: auc(segScores, labels),
        accuracy: accuracy(scores, labels, 0.35), baselineAccuracy: labels.length ? labels.filter((l) => !l).length / labels.length : null,
      },
      synthetic: true,
    };
  });
}

/** Lembrete avulso pela recepção: mesmo aviso do cron (app e e-mail) e WhatsApp simulado para quem autorizou. */
export async function remindSession(sessionId: string, user: CurrentUser) {
  const s = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { id: true, startsAt: true, status: true, unit: { select: { name: true } }, patient: { select: { phone: true, whatsappOptIn: true, user: { select: { id: true, name: true } } } } },
  });
  if (!s || (s.status !== "AGENDADA" && s.status !== "CONFIRMADA")) throw notFound("Sessão");
  const text = `Lembrete: sua sessão é ${fmtLong(s.startsAt)} às ${fmtTime(s.startsAt)} em ${s.unit.name}. Podemos contar com você?`;
  await notify(s.patient.user.id, { type: "LEMBRETE", title: `Sua sessão é ${fmtLong(s.startsAt)}`, body: text, href: "/app" });
  if (s.patient.whatsappOptIn)
    await sendWhatsApp({ userId: s.patient.user.id, contact: s.patient.user.name, phone: s.patient.phone, text, kind: "LEMBRETE", refId: s.id });
  await audit(user.id, "LEMBRETE_MANUAL", "Session", s.id);
  return { whatsapp: s.patient.whatsappOptIn };
}

