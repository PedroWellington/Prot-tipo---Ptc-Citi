import { HOUR_BANDS, hourBand } from "./schedule";
import { recifeParts } from "./time";

export type MetricRow = {
  status: string;
  number: number;
  startsAt: Date;
  type: "PARTICULAR" | "CONVENIO";
  unitCode: string;
  noticeHours: number | null;
  confirmedAt: Date | null;
  lateAt?: Date | null;
};

export type MetricRules = {
  lateCancelHours: number;
  countLateCancelAsNoShow: boolean;
  baselineNoShowPct: number;
  priceParticular: number;
  priceConvenio: number;
};

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);

type Tally = { faltas: number; base: number };

export function computeSessionMetrics(rows: MetricRow[], rules: MetricRules) {
  const isLate = (r: MetricRow) =>
    r.status === "DESMARCADA" && r.noticeHours !== null && r.noticeHours < rules.lateCancelHours;
  const isNoShow = (r: MetricRow) => r.status === "FALTA" || (rules.countLateCancelAsNoShow && isLate(r));
  const inBase = (r: MetricRow) => r.status === "REALIZADA" || isNoShow(r);

  const groups = new Map<string, Tally>();
  const add = (key: string, r: MetricRow) => {
    const t = groups.get(key) ?? { faltas: 0, base: 0 };
    if (inBase(r)) t.base++;
    if (isNoShow(r)) t.faltas++;
    groups.set(key, t);
  };

  let realizadas = 0, faltas = 0, desmarcacoes = 0, tardias = 0, reagendamentos = 0, atrasos = 0, confirmaveis = 0, confirmadas = 0;
  for (const r of rows) {
    if (r.status === "REALIZADA") realizadas++;
    if (r.status === "FALTA") faltas++;
    if (r.status === "DESMARCADA") desmarcacoes++;
    if (isLate(r)) tardias++;
    if (r.status === "REAGENDADA") reagendamentos++;
    if (r.lateAt) atrasos++;
    if (r.status === "REALIZADA" || r.status === "FALTA") {
      confirmaveis++;
      if (r.confirmedAt) confirmadas++;
    }
    add("total", r);
    add(`unit:${r.unitCode}`, r);
    add(`type:${r.type}`, r);
    add(`n:${r.number}`, r);
    add(`nt:${r.type}:${r.number}`, r);
    add(`band:${hourBand(recifeParts(r.startsAt).hour)}`, r);
  }

  const rate = (key: string) => {
    const t = groups.get(key);
    return t ? pct(t.faltas, t.base) : 0;
  };
  const byPrefix = (prefix: string) =>
    [...groups.keys()].filter((k) => k.startsWith(prefix)).map((k) => ({ key: k.slice(prefix.length), rate: rate(k) }));

  const typeBase = (t: string) => groups.get(`type:${t}`) ?? { faltas: 0, base: 0 };
  const recovered = (type: string, price: number) => {
    const { faltas: f, base } = typeBase(type);
    return Math.max(0, base * (rules.baselineNoShowPct / 100) - f) * price;
  };

  const numbers = Array.from({ length: 10 }, (_, i) => i + 1);
  return {
    totals: { realizadas, faltas, desmarcacoes, tardias, reagendamentos, atrasos },
    noShowRate: rate("total"),
    byUnit: byPrefix("unit:"),
    byType: byPrefix("type:"),
    byHourBand: HOUR_BANDS.map((b) => ({ key: b, rate: rate(`band:${b}`) })),
    bySessionNumber: numbers.map((n) => ({
      key: String(n),
      rate: rate(`n:${n}`),
      convenio: rate(`nt:CONVENIO:${n}`),
      particular: rate(`nt:PARTICULAR:${n}`),
    })),
    confirmationRate: pct(confirmadas, confirmaveis),
    recoveredRevenue: Math.round(recovered("PARTICULAR", rules.priceParticular) + recovered("CONVENIO", rules.priceConvenio)),
  };
}

export const percent = pct;
