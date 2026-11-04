/**
 * Previsão de comparecimento, receita e perda. Funções puras: o servidor busca os dados e chama estas funções;
 * os testes conferem as contas sem banco. O método está descrito no README ("Como calculamos as previsões").
 */
import { HOUR_BANDS, hourBand } from "./schedule";

export type PatientType = "PARTICULAR" | "CONVENIO";
export type Segment = { type: PatientType; number: number; band: string; unit: string };
export type HistRow = Segment & { missed: boolean };

/** Peso do segmento pai na suavização Beta: equivale a 20 sessões "emprestadas" do nível acima. */
export const PRIOR_STRENGTH = 20;
/** Amostra mínima para usar um segmento mais específico. */
export const MIN_SAMPLE = 30;
export const PEAK_BANDS: readonly string[] = [HOUR_BANDS[0], HOUR_BANDS[3]];
export { hourBand };

/** Sessões de reposição passam da 10ª: contam como a 10ª. */
export const clampNumber = (n: number) => Math.min(Math.max(n, 1), 10);
const LEVEL_NAMES = ["geral", "tipo", "tipo + sessão", "tipo + sessão + horário + unidade"] as const;
const keys = (s: Segment) => {
  const n = clampNumber(s.number);
  return ["all", s.type, `${s.type}|${n}`, `${s.type}|${n}|${s.band}|${s.unit}`];
};

export type RateModel = ReturnType<typeof buildRateModel>;

/**
 * Taxa de falta por segmento com suavização Beta em cascata: cada nível puxa para o pai
 * (tipo+sessão+horário+unidade → tipo+sessão → tipo → geral). Usa o nível mais específico com ao menos MIN_SAMPLE sessões.
 */
export function buildRateModel(rows: HistRow[], k = PRIOR_STRENGTH, minSample = MIN_SAMPLE) {
  const counts = new Map<string, { f: number; n: number }>();
  for (const r of rows)
    for (const key of keys(r)) {
      const c = counts.get(key) ?? { f: 0, n: 0 };
      c.n++;
      if (r.missed) c.f++;
      counts.set(key, c);
    }
  const global = counts.get("all") ?? { f: 0, n: 0 };
  // Sem histórico nenhum: 15% como ponto de partida neutro
  const globalRate = global.n ? global.f / global.n : 0.15;

  const smoothed = (seg: Segment) => {
    const ks = keys(seg);
    const out = [{ rate: globalRate, n: global.n }];
    for (let i = 1; i < ks.length; i++) {
      const c = counts.get(ks[i]) ?? { f: 0, n: 0 };
      out.push({ rate: (c.f + k * out[i - 1].rate) / (c.n + k), n: c.n });
    }
    return out;
  };

  function rateFor(seg: Segment) {
    const levels = smoothed(seg);
    let level = 0;
    for (let i = levels.length - 1; i >= 1; i--) if (levels[i].n >= minSample) { level = i; break; }
    if (level === 0 && levels[1].n > 0) level = 1;
    return { rate: levels[level].rate, n: levels[level].n, level: LEVEL_NAMES[level] };
  }

  return { rateFor, globalRate, sessions: global.n };
}

// ── Sessões futuras e Monte Carlo ──────────────────────────────

export type FutureSession = {
  id: string;
  value: number;
  /** Chance de comparecer. */
  p: number;
  day: number;
  unit: string;
  type: PatientType;
  band: string;
  number: number;
  confirmed: boolean;
  renewalPending: boolean;
};

/** PRNG determinístico (mulberry32): a mesma consulta dá a mesma faixa. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function quantile(sorted: number[], q: number) {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Receita das sessões futuras em `draws` sorteios de Bernoulli por sessão, ordenada. */
export function simulateRevenue(sessions: { value: number; p: number }[], draws = 2000, seed = 20261103) {
  const next = rng(seed);
  const out = new Float64Array(draws);
  for (let d = 0; d < draws; d++) {
    let total = 0;
    for (const s of sessions) if (next() < s.p) total += s.value;
    out[d] = total;
  }
  return Array.from(out).sort((a, b) => a - b);
}

export type Range = { expected: number; median: number; p80: [number, number]; p90: [number, number] };

const range = (sorted: number[], expected: number): Range => ({
  expected, median: quantile(sorted, 0.5),
  p80: [quantile(sorted, 0.1), quantile(sorted, 0.9)], p90: [quantile(sorted, 0.05), quantile(sorted, 0.95)],
});

/**
 * Mês = o que já aconteceu + o que se espera das sessões agendadas.
 * Por construção, receita futura + perda futura = valor agendado, em cada sorteio.
 */
export function monthForecast(input: { realized: number; pastLoss: number; future: FutureSession[]; draws?: number }) {
  const { realized, pastLoss, future, draws = 2000 } = input;
  const scheduled = future.reduce((a, s) => a + s.value, 0);
  const expRevenue = future.reduce((a, s) => a + s.value * s.p, 0);
  const sorted = simulateRevenue(future, draws);
  const revenue = range(sorted.map((x) => realized + x), realized + expRevenue);
  const lossSorted = sorted.map((x) => pastLoss + scheduled - x).reverse();
  const loss = range(lossSorted, pastLoss + scheduled - expRevenue);
  const attendance = future.length ? future.reduce((a, s) => a + s.p, 0) / future.length : null;
  return { realized, pastLoss, scheduled, revenue, loss, attendance, futureCount: future.length };
}

/** Receita acumulada por dia: realizada até hoje e prevista depois, com faixa de 80% (aproximação normal). */
export function dailySeries(days: number, today: number, realizedByDay: number[], future: FutureSession[]) {
  const exp = new Array(days + 1).fill(0), vari = new Array(days + 1).fill(0);
  for (const s of future) {
    exp[s.day] += s.value * s.p;
    vari[s.day] += s.value * s.value * s.p * (1 - s.p);
  }
  const out: { day: number; realized: number | null; expected: number | null; lo: number | null; hi: number | null }[] = [];
  let real = 0, e = 0, v = 0;
  for (let d = 1; d <= days; d++) {
    if (d <= today) real += realizedByDay[d] ?? 0;
    if (d >= today) { e += exp[d]; v += vari[d]; }
    // Depois de hoje a parte realizada fica parada; a prevista soma o esperado de cada dia
    const expected = d >= today ? real + e : null;
    const sd = Math.sqrt(v) * 1.2816;
    out.push({ day: d, realized: d <= today ? real : null, expected, lo: expected === null ? null : Math.max(real, expected - sd), hi: expected === null ? null : expected + sd });
  }
  return out;
}

/** Quebra por chave: valor agendado e perda esperada (já ocorrida + futura). */
export function breakdown<T extends string, S extends FutureSession>(future: S[], past: { key: T; loss: number }[], keyOf: (s: S) => T) {
  const m = new Map<T, { key: T; scheduled: number; expectedLoss: number; pastLoss: number; sessions: number }>();
  const get = (key: T) => m.get(key) ?? m.set(key, { key, scheduled: 0, expectedLoss: 0, pastLoss: 0, sessions: 0 }).get(key)!;
  for (const s of future) {
    const g = get(keyOf(s));
    g.scheduled += s.value;
    g.expectedLoss += s.value * (1 - s.p);
    g.sessions++;
  }
  for (const p of past) get(p.key).pastLoss += p.loss;
  return [...m.values()].map((g) => ({ ...g, totalLoss: g.pastLoss + g.expectedLoss })).sort((a, b) => b.totalLoss - a.totalLoss);
}

// ── Simulador "e se" ───────────────────────────────────────────

export type SimSession = { value: number; rate: number; rate6: number | null; rateOffPeak: number; peak: boolean; conv6: boolean; confirmed: boolean };
export type SimParams = { reduce6pp: number; remindersPct: number; saturdayPct: number };

/**
 * Perda futura esperada com as propostas do protótipo:
 * - renovação antecipada: a falta da 6ª sessão de convênio cai `reduce6pp` pontos;
 * - confirmação interativa: lembretes cortam `remindersPct`% da falta das sessões ainda não confirmadas;
 * - sábado: `saturdayPct`% das sessões de pico passam a ter a falta da faixa 9–12h.
 */
export function simulateLoss(sessions: SimSession[], p: SimParams) {
  let before = 0, after = 0;
  for (const s of sessions) {
    before += s.value * s.rate;
    let r = s.rate;
    if (s.conv6) r = Math.max(0, r - p.reduce6pp / 100);
    if (s.peak) r = r * (1 - p.saturdayPct / 100) + s.rateOffPeak * (p.saturdayPct / 100);
    if (!s.confirmed) r *= 1 - p.remindersPct / 100;
    after += s.value * r;
  }
  return { before, after, saved: before - after };
}

// ── Risco por paciente ─────────────────────────────────────────

export type PatientHistory = {
  done: number; missed: number; lateCancels: number; lates: number; reschedules: number;
  /** Presenças seguidas desde a última falta. */
  streak: number; lastMissed: boolean; confirmedRate: number | null;
};
export type NextSession = { type: PatientType; number: number; band: string; confirmed: boolean; renewalPending: boolean };

/** Peso do segmento no risco individual: com pouco histórico, o paciente fica perto da taxa do grupo. */
export const PATIENT_PRIOR = 6;
export type RiskLevel = "alto" | "medio" | "baixo";

/** Chance de faltar na próxima sessão. Só comportamento de atendimento: nada de idade, sexo, bairro, nome ou CPF. */
export function patientRisk(segRate: number, h: PatientHistory, next: NextSession) {
  const sample = h.done + h.missed;
  const own = (h.missed + 0.5 * h.lateCancels + PATIENT_PRIOR * segRate) / (sample + PATIENT_PRIOR);
  const factors: string[] = [];
  let p = own;
  if (h.missed) factors.push(`faltou ${h.missed} de ${sample} ${sample === 1 ? "sessão" : "sessões"}`);
  if (h.lastMissed) { p *= 1.4; factors.push("faltou a última sessão"); }
  if (h.lateCancels) factors.push(`${h.lateCancels} ${h.lateCancels === 1 ? "desmarcação" : "desmarcações"} em cima da hora`);
  if (h.lates >= 2) { p *= 1.15; factors.push(`${h.lates} atrasos`); }
  if (h.reschedules >= 2) { p *= 1.1; factors.push(`${h.reschedules} trocas de horário`); }
  if (h.streak >= 4 && !h.lastMissed) { p *= 0.75; factors.push(`${h.streak} presenças seguidas`); }
  if (next.confirmed) { p *= 0.6; factors.push("já confirmou a próxima"); }
  if (next.type === "CONVENIO" && clampNumber(next.number) === 6) factors.push("6ª sessão de convênio");
  if (next.renewalPending) factors.push("renovação do convênio pendente");
  if (PEAK_BANDS.includes(next.band)) factors.push("horário de pico");
  p = Math.min(0.9, Math.max(0.02, p));
  const level: RiskLevel = p >= 0.35 ? "alto" : p >= 0.2 ? "medio" : "baixo";
  const confidence = sample < 3 ? "baixa" : sample < 8 ? "média" : "alta";
  const action = level === "baixo" ? "Nenhuma ação necessária"
    : h.lastMissed ? "Ligar para o paciente"
    : next.renewalPending ? "Antecipar a renovação do convênio"
    : !next.confirmed ? "Confirmar por mensagem"
    : PEAK_BANDS.includes(next.band) ? "Oferecer outro horário"
    : "Colocar o horário na lista de espera";
  return { p, level, confidence, sample, factors, action };
}

// ── Backtest ───────────────────────────────────────────────────

/** Erro percentual absoluto médio, ignorando períodos com valor real zero. */
export function mape(pred: number[], actual: number[]) {
  const pairs = pred.map((p, i) => [p, actual[i]] as const).filter(([, a]) => a !== 0);
  return pairs.length ? (pairs.reduce((s, [p, a]) => s + Math.abs(p - a) / Math.abs(a), 0) / pairs.length) * 100 : null;
}

/** AUC pela estatística de Mann-Whitney: chance de um caso positivo ter nota maior que um negativo. */
export function auc(scores: number[], labels: boolean[]) {
  const idx = scores.map((s, i) => [s, labels[i]] as const).sort((a, b) => a[0] - b[0]);
  let rank = 0, posRanks = 0, pos = 0;
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j < idx.length && idx[j][0] === idx[i][0]) j++;
    const avg = (i + 1 + j) / 2; // empates dividem o posto
    for (let k = i; k < j; k++) if (idx[k][1]) { posRanks += avg; pos++; }
    rank = j;
    i = j;
  }
  const neg = rank - pos;
  return pos && neg ? (posRanks - (pos * (pos + 1)) / 2) / (pos * neg) : null;
}

export function accuracy(scores: number[], labels: boolean[], threshold: number) {
  if (!scores.length) return null;
  return scores.filter((s, i) => (s >= threshold) === labels[i]).length / scores.length;
}

/**
 * Chance de pelo menos uma falta entre sessões independentes: 1 − Π(1 − taxa de falta).
 * Faixa de sensibilidade: as mesmas contas com as taxas 20% menores e 20% maiores (incerteza do modelo por segmento).
 */
export function atLeastOneMiss(missRates: number[]) {
  const at = (k: number) => 1 - missRates.reduce((a, r) => a * (1 - Math.min(1, r * k)), 1);
  return { p: at(1), range: [at(0.8), at(1.2)] as [number, number], method: "1 − produto das chances de comparecimento de cada sessão agendada" };
}
