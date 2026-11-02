import { computeSessionMetrics, percent } from "@/lib/metrics";
import { hoursForDay } from "@/lib/schedule";
import { DAY, HOUR, fmtStamp, recifeParts } from "@/lib/time";
import { getSettings, listUnits } from "../repositories/config";
import { exportSessions, metricRows } from "../repositories/sessions";
import { renewalStats, requestStats, waitlistCounts } from "../repositories/requests";
import { endedTreatments } from "../repositories/treatments";

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export async function dashboard(from: Date, to: Date, unitId?: string) {
  const [cfg, units, rows, ended, requests, renewals, waitlist] = await Promise.all([
    getSettings(), listUnits(), metricRows(from, to, unitId), endedTreatments(from, to, unitId),
    requestStats(from, to), renewalStats(from, to, unitId), waitlistCounts(from, to),
  ]);
  const m = computeSessionMetrics(rows, {
    lateCancelHours: cfg.late_cancel_hours,
    countLateCancelAsNoShow: cfg.count_late_cancel_as_no_show,
    baselineNoShowPct: cfg.baseline_noshow_pct,
    priceParticular: cfg.price_particular,
    priceConvenio: cfg.price_convenio,
  });

  const decided = requests.filter((r) => r.decidedAt && r.status !== "CANCELADA");
  const countWait = (s: string) => waitlist.find((w) => w.status === s)?._count ?? 0;

  // Capacidade = cadeiras × horários abertos no período
  const end = Math.min(to.getTime(), Date.now());
  let capacity = 0;
  for (const u of units.filter((x) => !unitId || x.id === unitId))
    for (let t = from.getTime(); t < end; t += DAY) capacity += u.chairs * hoursForDay(u, recifeParts(new Date(t)).weekday).length;

  return {
    ...m,
    abandonRate: percent(ended.filter((t) => t.status === "ABANDONADO").length, ended.length),
    avgRenewalDays: Math.round(avg(renewals.map((r) => (r.decidedAt.getTime() - r.requestedAt.getTime()) / DAY)) * 10) / 10,
    reschedule: {
      total: requests.length,
      approved: requests.filter((r) => r.status === "APROVADA").length,
      rejected: requests.filter((r) => r.status === "RECUSADA").length,
      avgResponseHours: Math.round(avg(decided.map((r) => (r.decidedAt!.getTime() - r.createdAt.getTime()) / HOUR)) * 10) / 10,
    },
    waitlist: { offered: countWait("OFERTADA") + countWait("ACEITA") + countWait("EXPIRADA"), accepted: countWait("ACEITA"), active: countWait("ATIVA") },
    occupancy: percent(m.totals.realizadas, capacity),
    rules: { baselineNoShowPct: cfg.baseline_noshow_pct, priceParticular: cfg.price_particular, priceConvenio: cfg.price_convenio },
  };
}

// Sinal no início faria o Excel interpretar a célula como fórmula
const cell = (v: unknown) => {
  const s = String(v ?? "");
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

export async function sessionsCsv(from: Date, to: Date, unitId?: string) {
  const rows = await exportSessions(from, to, unitId);
  const head = ["data", "unidade", "sessao", "status", "motivo", "antecedencia_h", "atraso", "tipo", "convenio", "fisioterapeuta"];
  const lines = rows.map((r) =>
    [fmtStamp(r.startsAt), r.unit.code, r.number, r.status, r.reason, r.noticeHours?.toFixed(1), r.lateAt ? "sim" : "nao", r.patient.type, r.patient.insurer, r.physio.user.name].map(cell).join(";"),
  );
  return "﻿" + [head.join(";"), ...lines].join("\r\n");
}
