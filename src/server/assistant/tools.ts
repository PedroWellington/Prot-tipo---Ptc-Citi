import { createHash } from "node:crypto";
import { z } from "zod";
import { fold, matchNames, PERIODS, type Period } from "@/lib/assistente";
import { monthRange, shiftMonth, ymOf } from "@/lib/calendar";
import { atLeastOneMiss, simulateLoss } from "@/lib/previsao";
import { HOUR_BANDS, hourBand } from "@/lib/schedule";
import { atRecife, DAY, dayKey, fmtDate, fmtTime, recifeParts, startOfRecifeDay, WEEKDAYS } from "@/lib/time";
import type { CurrentUser } from "../auth/session";
import { prisma } from "../db";
import { audit, getSettings, listUnits } from "../repositories/config";
import { dayCapacity } from "../services/agenda";
import { financeiro, futureRisk, previsoes } from "../services/analytics";
import { availableSlots } from "../services/schedule";
import type { Answer } from "../services/assistente";

/**
 * Ferramentas do assistente: só leitura, parâmetros validados com Zod e resultados agregados.
 * Pacientes saem como iniciais + identificador interno (P-xxxxxx); o nome é resolvido só no servidor, na resposta final.
 * O modelo nunca recebe CPF, telefone, e-mail ou endereço, e nunca faz contas: os números já vêm prontos.
 */

type Unit = Awaited<ReturnType<typeof listUnits>>[number];
export type ToolCtx = { user: CurrentUser; now: Date; refs: Map<string, string>; units: Unit[] };
export type ToolResult = { data: Record<string, unknown>; card?: Partial<Answer> };
export type Tool = { name: string; description: string; schema: z.ZodType; run: (args: never, ctx: ToolCtx) => Promise<ToolResult> };

// ── Utilidades ───────────────────────────────────────────────

const r1 = (n: number) => Math.round(n * 10) / 10;
const pct = (n: number) => r1(n * 100);
const reais = (n: number) => Math.round(n);
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const num = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const iso = (d: Date) => dayKey(d);

/** Identificador interno estável do paciente: só letras, para não se confundir com números na verificação. */
export function refOf(patientId: string) {
  const h = createHash("sha256").update(`mv:${patientId}`).digest();
  return `P-${Array.from(h.subarray(0, 6), (b) => String.fromCharCode(97 + (b % 26))).join("")}`;
}
export const initialsOf = (name: string) => {
  const parts = name.trim().split(/\s+/).filter((p) => p.length > 2);
  const pick = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts.length ? parts : [name];
  return pick.map((p) => `${p[0].toUpperCase()}.`).join("");
};
const person = (ctx: ToolCtx, patientId: string, name: string) => {
  const ref = refOf(patientId);
  ctx.refs.set(ref, name);
  return { ref, iniciais: initialsOf(name) };
};

const SENSITIVE_KEY = /^(cpf|phone|telefone|celular|whatsapp|email|e_?mail|endereco|address|name|nome|nome_completo|carteirinha|cardNumber)$/i;
/** Última barreira antes do modelo: tira chaves sensíveis e qualquer texto com cara de e-mail, CPF ou telefone. */
export function sanitize<T>(v: T): T {
  if (Array.isArray(v)) return v.map(sanitize) as T;
  if (v instanceof Date) return iso(v) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).filter(([k]) => !SENSITIVE_KEY.test(k)).map(([k, x]) => [k, sanitize(x)])) as T;
  if (typeof v === "string") return v.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[removido]").replace(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g, "[removido]").replace(/\(?\d{2}\)?\s?9?\d{4}-?\d{4}/g, "[removido]") as T;
  return v;
}

const periodo = z.enum(PERIODS).optional().describe("Período relativo, resolvido no fuso de São Paulo");
const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use AAAA-MM-DD").optional();
const unidade = z.string().trim().max(40).optional().describe("Nome ou sigla da unidade (Boa Viagem = BV, Casa Forte = CF). Vazio = todas");
const periodArgs = { periodo, de: data.describe("Início AAAA-MM-DD (opcional)"), ate: data.describe("Fim AAAA-MM-DD, inclusive (opcional)") };

const weekStart = (d: Date) => new Date(startOfRecifeDay(d).getTime() - ((recifeParts(d).weekday + 6) % 7) * DAY);
const LABEL: Record<Period, string> = {
  hoje: "hoje", amanha: "amanhã", ontem: "ontem", esta_semana: "esta semana", semana_que_vem: "a próxima semana", semana_passada: "a semana passada",
  este_mes: "este mês", mes_que_vem: "o próximo mês", mes_passado: "o mês passado",
  ultimos_7_dias: "os últimos 7 dias", ultimos_30_dias: "os últimos 30 dias", ultimos_90_dias: "os últimos 90 dias", ultimos_180_dias: "os últimos 180 dias",
};

/** Datas relativas → intervalo [de, até) em horário de São Paulo (UTC−3, igual a Recife). */
export function resolvePeriod(a: { periodo?: Period; de?: string; ate?: string }, now: Date, fallback: Period) {
  if (a.de || a.ate) {
    const parse = (s: string) => { const [y, m, d] = s.split("-").map(Number); return atRecife(y, m, d); };
    const from = parse(a.de ?? a.ate!), to = new Date(parse(a.ate ?? a.de!).getTime() + DAY);
    return { from, to, label: `de ${fmtDate(from)} a ${fmtDate(new Date(to.getTime() - DAY))}` };
  }
  const p = a.periodo ?? fallback;
  const today = startOfRecifeDay(now).getTime(), ws = weekStart(now).getTime(), ym = ymOf(now);
  const span: Record<Period, [number, number]> = {
    hoje: [today, today + DAY], amanha: [today + DAY, today + 2 * DAY], ontem: [today - DAY, today],
    esta_semana: [ws, ws + 7 * DAY], semana_que_vem: [ws + 7 * DAY, ws + 14 * DAY], semana_passada: [ws - 7 * DAY, ws],
    este_mes: [monthRange(ym).start.getTime(), monthRange(ym).end.getTime()],
    mes_que_vem: [monthRange(shiftMonth(ym, 1)).start.getTime(), monthRange(shiftMonth(ym, 1)).end.getTime()],
    mes_passado: [monthRange(shiftMonth(ym, -1)).start.getTime(), monthRange(shiftMonth(ym, -1)).end.getTime()],
    ultimos_7_dias: [now.getTime() - 7 * DAY, now.getTime()], ultimos_30_dias: [now.getTime() - 30 * DAY, now.getTime()],
    ultimos_90_dias: [now.getTime() - 90 * DAY, now.getTime()], ultimos_180_dias: [now.getTime() - 180 * DAY, now.getTime()],
  };
  const [f, t] = span[p];
  const from = new Date(f), to = new Date(t);
  const days = Math.round((t - f) / DAY);
  return { from, to, label: days <= 1 ? `${LABEL[p]} (${fmtDate(from)})` : `${LABEL[p]} (${fmtDate(from)} a ${fmtDate(new Date(t - 1))})` };
}

function resolveUnit(ctx: ToolCtx, raw?: string) {
  if (!raw || /^(todas?|geral|todas as unidades)$/i.test(raw.trim())) return { unit: undefined, nome: "Todas as unidades" };
  const t = fold(raw);
  const unit = ctx.units.find((u) => u.code.toLowerCase() === t || fold(u.name) === t || fold(u.name).includes(t) || t.includes(fold(u.name)));
  if (!unit) throw new ToolInputError(`Unidade desconhecida: use uma de ${ctx.units.map((u) => `${u.name} (${u.code})`).join(", ")}`);
  return { unit, nome: unit.name };
}

export class ToolInputError extends Error {}

const unitHref = (ctx: ToolCtx, aba: string) => (ctx.user.role === "RECEPCAO" ? (aba === "financeiro" ? "/recepcao/previsoes#financeiro" : "/recepcao/previsoes") : `/admin?aba=${aba}`);

// ── Ferramentas ──────────────────────────────────────────────

const faltasPorPeriodo = {
  name: "faltas_por_periodo",
  description: "Faltas que JÁ aconteceram num período passado: total, taxa, desmarcações tardias e divisão por unidade, tipo (particular/convênio) e faixa de horário.",
  schema: z.object({ ...periodArgs, unidade, tipo: z.enum(["PARTICULAR", "CONVENIO"]).optional(), faixa: z.enum(HOUR_BANDS).optional() }),
  async run(a: { periodo?: Period; de?: string; ate?: string; unidade?: string; tipo?: "PARTICULAR" | "CONVENIO"; faixa?: string }, ctx: ToolCtx): Promise<ToolResult> {
    const p = resolvePeriod(a, ctx.now, "ultimos_90_dias");
    const { unit, nome } = resolveUnit(ctx, a.unidade);
    const cfg = await getSettings();
    const rows = (await prisma.session.findMany({
      where: { startsAt: { gte: p.from, lt: new Date(Math.min(p.to.getTime(), ctx.now.getTime())) }, status: { in: ["REALIZADA", "FALTA", "DESMARCADA"] }, ...(unit ? { unitId: unit.id } : {}), ...(a.tipo ? { patient: { type: a.tipo } } : {}) },
      select: { status: true, startsAt: true, noticeHours: true, unit: { select: { name: true } }, patient: { select: { type: true } } },
    })).filter((s) => !a.faixa || hourBand(recifeParts(s.startsAt).hour) === a.faixa);
    const group = (key: (s: (typeof rows)[number]) => string) => {
      const m = new Map<string, { sessoes: number; faltas: number }>();
      for (const s of rows) {
        if (s.status === "DESMARCADA") continue;
        const g = m.get(key(s)) ?? { sessoes: 0, faltas: 0 };
        g.sessoes++;
        if (s.status === "FALTA") g.faltas++;
        m.set(key(s), g);
      }
      return [...m].map(([k, g]) => ({ grupo: k, ...g, taxa_pct: g.sessoes ? pct(g.faltas / g.sessoes) : 0 }));
    };
    const attended = rows.filter((s) => s.status !== "DESMARCADA");
    const faltas = attended.filter((s) => s.status === "FALTA").length;
    const tardias = rows.filter((s) => s.status === "DESMARCADA" && s.noticeHours !== null && s.noticeHours < cfg.late_cancel_hours).length;
    const porFaixa = group((s) => hourBand(recifeParts(s.startsAt).hour));
    return {
      data: {
        periodo: p.label, de: iso(p.from), ate: iso(new Date(p.to.getTime() - 1)), unidade: nome, tipo: a.tipo ?? "todos", faixa: a.faixa ?? "todas",
        sessoes_realizadas_ou_faltas: attended.length, faltas, taxa_faltas_pct: attended.length ? pct(faltas / attended.length) : 0,
        desmarcacoes: rows.length - attended.length, desmarcacoes_tardias: tardias, regra_tardia_horas: cfg.late_cancel_hours,
        por_unidade: group((s) => s.unit.name), por_tipo: group((s) => (s.patient.type === "CONVENIO" ? "Convênio" : "Particular")), por_faixa: porFaixa,
        amostra: attended.length,
      },
      card: {
        numbers: [{ label: "Faltas", value: String(faltas) }, { label: "Taxa de faltas", value: `${num(attended.length ? pct(faltas / attended.length) : 0)}%` }, { label: "Sessões", value: String(attended.length) }, { label: "Desmarcações tardias", value: String(tardias) }],
        bars: porFaixa.map((g) => ({ label: g.grupo, value: g.taxa_pct, display: `${num(g.taxa_pct)}%` })),
        link: { href: ctx.user.role === "RECEPCAO" ? "/recepcao/previsoes" : "/admin?aba=faltas", label: "Ver detalhes" },
        export: { item: "faltas-por-periodo", title: `Faltas · ${p.label}`, filters: { unidade: nome, periodo: `${iso(p.from)}_${iso(new Date(p.to.getTime() - 1))}` } },
      },
    };
  },
};

const previsaoFaltas = {
  name: "previsao_faltas",
  description: "Previsão de faltas em sessões AGENDADAS de um período futuro (hoje, amanhã, semana, mês ou datas): faltas esperadas, faixa de 80% e a chance de PELO MENOS 1 falta, com o método.",
  schema: z.object({ ...periodArgs, unidade }),
  async run(a: { periodo?: Period; de?: string; ate?: string; unidade?: string }, ctx: ToolCtx): Promise<ToolResult> {
    const p = resolvePeriod(a, ctx.now, "amanha");
    const { unit, nome } = resolveUnit(ctx, a.unidade);
    const risk = await futureRisk(p.from, p.to, unit?.id);
    const rates = risk.sessions.map((s) => s.missRate);
    const expected = rates.reduce((x, r) => x + r, 0);
    const sd = Math.sqrt(rates.reduce((x, r) => x + r * (1 - r), 0));
    const one = atLeastOneMiss(rates);
    const byUnit = new Map<string, { sessoes: number; esperadas: number }>();
    for (const s of risk.sessions) { const g = byUnit.get(s.unit) ?? { sessoes: 0, esperadas: 0 }; g.sessoes++; g.esperadas += s.missRate; byUnit.set(s.unit, g); }
    const p80 = [Math.max(0, expected - 1.2816 * sd), expected + 1.2816 * sd];
    return {
      data: {
        periodo: p.label, de: iso(p.from), ate: iso(new Date(p.to.getTime() - 1)), unidade: nome, estimativa: true,
        sessoes_agendadas: rates.length, faltas_esperadas: r1(expected), faixa_80_pct: [r1(p80[0]), r1(p80[1])], nivel_confianca_pct: 80,
        chance_pelo_menos_1_falta_pct: pct(one.p), faixa_sensibilidade_pct: [pct(one.range[0]), pct(one.range[1])],
        metodo: `${one.method}; taxa de falta de cada sessão pelo modelo de segmentos (tipo, número da sessão, horário e unidade); faixa: taxas 20% menores e maiores`,
        historico_usado: { sessoes: risk.sample, dias: risk.historyDays },
        por_unidade: [...byUnit].map(([k, g]) => ({ unidade: k, sessoes: g.sessoes, faltas_esperadas: r1(g.esperadas) })),
      },
      card: {
        numbers: [{ label: "Pelo menos 1 falta", value: `${num(pct(one.p))}%` }, { label: "Faltas esperadas", value: num(r1(expected)) }, { label: "Faixa de 80%", value: `${num(r1(p80[0]))} a ${num(r1(p80[1]))}` }, { label: "Sessões agendadas", value: String(rates.length) }],
        bars: [...byUnit].map(([k, g]) => ({ label: k, value: g.esperadas, display: num(r1(g.esperadas)) })),
        link: { href: unitHref(ctx, "previsoes"), label: "Ver detalhes" },
        export: { item: "previsao-faltas", title: `Previsão de faltas · ${p.label}`, filters: { unidade: nome, periodo: iso(p.from) } },
      },
    };
  },
};

const mesArg = z.string().regex(/^(este_mes|mes_que_vem|mes_passado|\d{4}-(0[1-9]|1[0-2]))$/, "Use este_mes, mes_que_vem, mes_passado ou AAAA-MM").default("este_mes");
const ymFrom = (m: string, now: Date) => (m === "este_mes" ? ymOf(now) : m === "mes_que_vem" ? shiftMonth(ymOf(now), 1) : m === "mes_passado" ? shiftMonth(ymOf(now), -1) : m);

const previsaoReceita = {
  name: "previsao_receita_perda",
  description: "Receita realizada e prevista e perda com faltas/desmarcações tardias de um mês, com faixa de 80% (Monte Carlo) e divisão por unidade.",
  schema: z.object({ mes: mesArg, unidade }),
  async run(a: { mes: string; unidade?: string }, ctx: ToolCtx): Promise<ToolResult> {
    const ym = ymFrom(a.mes, ctx.now);
    const { unit, nome } = resolveUnit(ctx, a.unidade);
    const f = await financeiro(ym, unit?.id, 180);
    const c = f.cards;
    return {
      data: {
        mes: ym, unidade: nome, estimativa: true, nivel_confianca_pct: 80,
        receita_realizada_reais: reais(c.realized), sessoes_realizadas: c.realizedCount,
        receita_prevista_reais: reais(c.revenue.expected), receita_faixa_80_reais: c.revenue.p80.map(reais),
        perda_prevista_reais: reais(c.loss.expected), perda_faixa_80_reais: c.loss.p80.map(reais), perda_ja_ocorrida_reais: reais(c.pastLoss),
        sessoes_futuras: c.futureCount, comparecimento_previsto_pct: c.attendance === null ? null : pct(c.attendance),
        por_unidade: f.breakdowns.unidade.map((g) => ({ unidade: g.key, perda_total_reais: reais(g.totalLoss), perda_ocorrida_reais: reais(g.pastLoss), perda_prevista_reais: reais(g.expectedLoss) })),
        historico_usado: f.seal,
      },
      card: {
        numbers: [{ label: "Receita prevista", value: brl(c.revenue.expected) }, { label: "Faixa de 80%", value: `${brl(c.revenue.p80[0])} a ${brl(c.revenue.p80[1])}` }, { label: "Perda prevista", value: brl(c.loss.expected) }, { label: "Já realizada", value: brl(c.realized) }],
        bars: f.breakdowns.unidade.map((g) => ({ label: g.key, value: g.totalLoss, display: brl(g.totalLoss) })),
        link: { href: unitHref(ctx, "financeiro"), label: "Ver detalhes" },
        export: { item: "receita-perda", title: `Receita e perda · ${ym}`, filters: { unidade: nome, periodo: ym } },
      },
    };
  },
};

async function nextPatients(unitId?: string) {
  const [a, b] = await Promise.all([previsoes(unitId, "atual", 180), previsoes(unitId, "proxima", 180)]);
  return [...a.patients, ...b.patients.filter((p) => !a.patients.some((x) => x.patientId === p.patientId))];
}

const riscoPaciente = {
  name: "risco_paciente",
  description: "Chance de um paciente faltar na próxima sessão (próximas duas semanas), fatores e ação sugerida. Se houver nomes parecidos, devolve as opções para confirmar.",
  schema: z.object({ paciente: z.string().trim().min(2).max(80).describe("Nome (ou parte) como o usuário escreveu, ou o identificador P-xxxxxx") }),
  async run(a: { paciente: string }, ctx: ToolCtx): Promise<ToolResult> {
    const people = await nextPatients();
    const byRef = people.filter((p) => refOf(p.patientId) === a.paciente.trim());
    const found = byRef.length ? byRef : matchNames(a.paciente, people);
    if (!found.length) return { data: { encontrado: false, motivo: "Nenhum paciente com esse nome tem sessão nas próximas duas semanas" } };
    if (found.length > 1) {
      const opcoes = found.slice(0, 6).map((p) => person(ctx, p.patientId, p.name));
      return { data: { encontrado: false, ambiguo: true, opcoes }, card: { choices: found.slice(0, 6).map((p) => ({ label: p.name, text: `Risco do paciente ${p.name}` })) } };
    }
    const p = found[0];
    await audit(ctx.user.id, "RISCO_PACIENTE_CONSULTADO", "PatientProfile", p.patientId, { via: "assistente-ia" });
    return {
      data: {
        encontrado: true, paciente: person(ctx, p.patientId, p.name), estimativa: true,
        chance_falta_pct: pct(p.p), nivel: p.level, confianca: p.confidence, sessoes_de_historico: p.sample, taxa_do_grupo_pct: pct(p.segmentRate),
        fatores: p.factors, acao_sugerida: p.action,
        proxima_sessao: { data: iso(p.startsAt), dia_semana: WEEKDAYS[recifeParts(p.startsAt).weekday], hora: fmtTime(p.startsAt), unidade: p.unit, numero_sessao: p.number, tipo: p.type },
      },
      card: {
        numbers: [{ label: "Chance de faltar", value: `${num(pct(p.p))}%` }, { label: "Taxa do grupo", value: `${num(pct(p.segmentRate))}%` }, { label: "Confiança", value: p.confidence }, { label: "Próxima sessão", value: `${fmtDate(p.startsAt)} ${fmtTime(p.startsAt)}` }],
        link: { href: unitHref(ctx, "previsoes"), label: "Ver detalhes" }, names: [p.name],
        export: { item: "risco-paciente", title: `Risco de falta · ${p.name}`, filters: { unidade: p.unit, periodo: "proxima-sessao" } },
      },
    };
  },
};

const maiorRisco = {
  name: "pacientes_maior_risco",
  description: "Pacientes com maior chance de faltar na próxima sessão (desta semana ou da próxima).",
  schema: z.object({ limite: z.number().int().min(1).max(10).default(5), unidade, semana: z.enum(["esta_semana", "semana_que_vem"]).default("esta_semana") }),
  async run(a: { limite: number; unidade?: string; semana: "esta_semana" | "semana_que_vem" }, ctx: ToolCtx): Promise<ToolResult> {
    const { unit, nome } = resolveUnit(ctx, a.unidade);
    const d = await previsoes(unit?.id, a.semana === "semana_que_vem" ? "proxima" : "atual", 180);
    const top = d.patients.slice(0, a.limite);
    await audit(ctx.user.id, "RISCO_PACIENTES_CONSULTADO", "Assistente", null, { pacientes: top.length, via: "assistente-ia" });
    return {
      data: {
        semana: a.semana, unidade: nome, estimativa: true, pacientes_com_sessao: d.patients.length,
        pacientes: top.map((p) => ({ ...person(ctx, p.patientId, p.name), chance_falta_pct: pct(p.p), nivel: p.level, fatores: p.factors.slice(0, 3), acao_sugerida: p.action, proxima_sessao: `${iso(p.startsAt)} ${fmtTime(p.startsAt)}`, unidade: p.unit })),
      },
      card: {
        bars: top.map((p) => ({ label: p.name, value: p.p * 100, display: `${num(pct(p.p))}%` })), names: top.map((p) => p.name),
        link: { href: unitHref(ctx, "previsoes"), label: "Ver detalhes" },
        export: { item: "pacientes-maior-risco", title: "Pacientes com maior risco de faltar", filters: { unidade: nome, periodo: a.semana } },
      },
    };
  },
};

const STATUS_PT: Record<string, string> = { AGENDADA: "a confirmar", CONFIRMADA: "confirmada", REALIZADA: "realizada", FALTA: "falta", DESMARCADA: "desmarcada" };

const sessoesDoDia = {
  name: "sessoes_do_dia",
  description: "Sessões de um dia (padrão: hoje): contagem por status, unidade e faixa de horário, e a lista (hora, paciente por iniciais, status).",
  schema: z.object({ data: data.describe("Dia AAAA-MM-DD; ou use periodo"), periodo: z.enum(["hoje", "amanha", "ontem"]).optional(), unidade }),
  async run(a: { data?: string; periodo?: "hoje" | "amanha" | "ontem"; unidade?: string }, ctx: ToolCtx): Promise<ToolResult> {
    const p = resolvePeriod({ periodo: a.periodo, de: a.data, ate: a.data }, ctx.now, "hoje");
    const { unit, nome } = resolveUnit(ctx, a.unidade);
    const rows = await prisma.session.findMany({
      where: { startsAt: { gte: p.from, lt: p.to }, status: { not: "REAGENDADA" }, ...(unit ? { unitId: unit.id } : {}) },
      select: { startsAt: true, status: true, lateAt: true, provisional: true, patientId: true, unit: { select: { name: true } }, patient: { select: { user: { select: { name: true } } } } },
      orderBy: { startsAt: "asc" },
    });
    const count = (key: (s: (typeof rows)[number]) => string) => Object.entries(rows.reduce<Record<string, number>>((m, s) => ((m[key(s)] = (m[key(s)] ?? 0) + 1), m), {})).map(([k, n]) => ({ grupo: k, sessoes: n }));
    const byStatus = count((s) => STATUS_PT[s.status] ?? s.status);
    return {
      data: {
        dia: p.label, data: iso(p.from), unidade: nome, total: rows.length, por_status: byStatus, por_unidade: count((s) => s.unit.name),
        por_faixa: count((s) => hourBand(recifeParts(s.startsAt).hour)), com_atraso: rows.filter((s) => s.lateAt).length, aguardando_convenio: rows.filter((s) => s.provisional).length,
        lista: rows.slice(0, 25).map((s) => ({ hora: fmtTime(s.startsAt), ...person(ctx, s.patientId, s.patient.user.name), status: STATUS_PT[s.status], unidade: s.unit.name })),
        lista_truncada: rows.length > 25,
      },
      card: {
        numbers: byStatus.slice(0, 4).map((g) => ({ label: g.grupo[0].toUpperCase() + g.grupo.slice(1), value: String(g.sessoes) })),
        link: { href: ctx.user.role === "ADMIN" || ctx.user.role === "RECEPCAO" ? "/recepcao" : "/fisio", label: "Abrir a agenda" },
      },
    };
  },
};

const ocupacao = {
  name: "ocupacao",
  description: "Ocupação das cadeiras num período: sessões marcadas sobre a capacidade (cadeiras × horas abertas), por unidade.",
  schema: z.object({ ...periodArgs, unidade }),
  async run(a: { periodo?: Period; de?: string; ate?: string; unidade?: string }, ctx: ToolCtx): Promise<ToolResult> {
    const p = resolvePeriod(a, ctx.now, "esta_semana");
    const { unit, nome } = resolveUnit(ctx, a.unidade);
    const scoped = unit ? [unit] : ctx.units;
    const out = await Promise.all(scoped.map(async (u) => {
      const booked = await prisma.session.count({ where: { unitId: u.id, startsAt: { gte: p.from, lt: p.to }, status: { in: ["AGENDADA", "CONFIRMADA", "REALIZADA", "FALTA"] } } });
      let cap = 0;
      for (let t = p.from.getTime(); t < p.to.getTime(); t += DAY) cap += dayCapacity(dayKey(new Date(t)), [u], { unitId: u.id });
      return { unidade: u.name, sessoes: booked, capacidade: cap, ocupacao_pct: cap ? pct(booked / cap) : 0 };
    }));
    const total = out.reduce((x, g) => ({ s: x.s + g.sessoes, c: x.c + g.capacidade }), { s: 0, c: 0 });
    return {
      data: { periodo: p.label, unidade: nome, sessoes: total.s, capacidade: total.c, ocupacao_pct: total.c ? pct(total.s / total.c) : 0, por_unidade: out },
      card: { numbers: [{ label: "Ocupação", value: `${num(total.c ? pct(total.s / total.c) : 0)}%` }, { label: "Sessões", value: String(total.s) }, { label: "Capacidade", value: String(total.c) }], bars: out.map((g) => ({ label: g.unidade, value: g.ocupacao_pct, display: `${num(g.ocupacao_pct)}%` })) },
    };
  },
};

const renovacoes = {
  name: "renovacoes_convenio",
  description: "Renovações de autorização de convênio de tratamentos ativos: quantas em cada status, atrasadas e a lista das pendentes.",
  schema: z.object({ status: z.enum(["NAO_INICIADA", "SOLICITADA", "EM_ANALISE", "LIBERADA", "NEGADA"]).optional() }),
  async run(a: { status?: string }, ctx: ToolCtx): Promise<ToolResult> {
    const rows = await prisma.insuranceRenewal.findMany({
      where: { treatment: { status: "ATIVO" }, ...(a.status ? { status: a.status as never } : {}) },
      select: { status: true, expectedAt: true, requestedAt: true, treatment: { select: { completedSessions: true, patientId: true, unit: { select: { name: true } }, patient: { select: { user: { select: { name: true } } } } } } },
    });
    const by = rows.reduce<Record<string, number>>((m, r) => ((m[r.status] = (m[r.status] ?? 0) + 1), m), {});
    const pending = rows.filter((r) => r.status === "SOLICITADA" || r.status === "EM_ANALISE");
    return {
      data: {
        total: rows.length, por_status: by, pendentes: pending.length, atrasadas: pending.filter((r) => r.expectedAt && r.expectedAt < ctx.now).length,
        lista_pendentes: pending.slice(0, 15).map((r) => ({ ...person(ctx, r.treatment.patientId, r.treatment.patient.user.name), status: r.status, previsao: r.expectedAt ? iso(r.expectedAt) : null, sessoes_feitas: r.treatment.completedSessions, unidade: r.treatment.unit.name })),
      },
      card: { numbers: Object.entries(by).slice(0, 4).map(([k, n]) => ({ label: k.replace("_", " ").toLowerCase(), value: String(n) })), link: { href: "/recepcao/renovacoes", label: "Ver detalhes" } },
    };
  },
};

const listaEspera = {
  name: "lista_espera",
  description: "Lista de espera: quantos pacientes aguardam, por unidade, e os dias/horários mais pedidos.",
  schema: z.object({ unidade }),
  async run(a: { unidade?: string }, ctx: ToolCtx): Promise<ToolResult> {
    const { unit, nome } = resolveUnit(ctx, a.unidade);
    const rows = await prisma.waitlistEntry.findMany({ where: { status: { in: ["ATIVA", "OFERTADA"] }, ...(unit ? { unitId: unit.id } : {}) }, select: { status: true, weekday: true, hour: true, unit: { select: { name: true } } } });
    const tally = (key: (r: (typeof rows)[number]) => string) => Object.entries(rows.reduce<Record<string, number>>((m, r) => ((m[key(r)] = (m[key(r)] ?? 0) + 1), m), {})).sort((x, y) => y[1] - x[1]).map(([k, n]) => ({ grupo: k, pedidos: n }));
    return {
      data: { unidade: nome, aguardando: rows.length, com_vaga_ofertada: rows.filter((r) => r.status === "OFERTADA").length, por_unidade: tally((r) => r.unit.name), horarios_mais_pedidos: tally((r) => `${WEEKDAYS[r.weekday]} ${r.hour}h`).slice(0, 5) },
      card: { numbers: [{ label: "Aguardando", value: String(rows.length) }], link: { href: "/recepcao/espera", label: "Ver lista" } },
    };
  },
};

const trocas = {
  name: "trocas",
  description: "Solicitações de troca de horário feitas num período (padrão: últimos 30 dias), por status.",
  schema: z.object({ status: z.enum(["PENDENTE", "APROVADA", "RECUSADA", "CANCELADA"]).optional(), ...periodArgs }),
  async run(a: { status?: string; periodo?: Period; de?: string; ate?: string }, ctx: ToolCtx): Promise<ToolResult> {
    const p = resolvePeriod(a, ctx.now, "ultimos_30_dias");
    const g = await prisma.rescheduleRequest.groupBy({ by: ["status"], where: { createdAt: { gte: p.from, lt: p.to }, ...(a.status ? { status: a.status as never } : {}) }, _count: true });
    const pendingNow = await prisma.rescheduleRequest.count({ where: { status: "PENDENTE" } });
    return {
      data: { periodo: p.label, por_status: Object.fromEntries(g.map((x) => [x.status, x._count])), total: g.reduce((s, x) => s + x._count, 0), pendentes_agora: pendingNow },
      card: { numbers: [{ label: "Pendentes agora", value: String(pendingNow) }, ...g.map((x) => ({ label: x.status.toLowerCase(), value: String(x._count) }))].slice(0, 4), link: { href: "/recepcao/trocas", label: "Ver trocas" } },
    };
  },
};

const pagamentos = {
  name: "pagamentos_pendentes",
  description: "Cobranças PIX aguardando pagamento (quantidade e valor) e as que venceram nos últimos 30 dias.",
  schema: z.object({}),
  async run(_a: unknown, ctx: ToolCtx): Promise<ToolResult> {
    const [open, expired] = await Promise.all([
      prisma.payment.aggregate({ where: { status: "AGUARDANDO" }, _count: true, _sum: { amountCents: true } }),
      prisma.payment.count({ where: { status: "EXPIRADO", expiresAt: { gte: new Date(ctx.now.getTime() - 30 * DAY) } } }),
    ]);
    const total = (open._sum.amountCents ?? 0) / 100;
    return {
      data: { aguardando: open._count, valor_aguardando_reais: reais(total), vencidas_ultimos_30_dias: expired },
      card: { numbers: [{ label: "Aguardando", value: String(open._count) }, { label: "Valor", value: brl(total) }, { label: "Vencidas (30 dias)", value: String(expired) }], link: { href: "/recepcao/pagamentos", label: "Ver pagamentos" } },
    };
  },
};

const horariosLivres = {
  name: "horarios_livres",
  description: "Horários livres para agendar numa unidade (exige a unidade), a partir de hoje ou de uma data, por até 14 dias.",
  schema: z.object({ unidade: z.string().trim().min(1).max(40).describe("Obrigatório: Boa Viagem (BV) ou Casa Forte (CF)"), de: data, dias: z.number().int().min(1).max(14).default(7) }),
  async run(a: { unidade: string; de?: string; dias: number }, ctx: ToolCtx): Promise<ToolResult> {
    const { unit, nome } = resolveUnit(ctx, a.unidade);
    if (!unit) throw new ToolInputError("Informe a unidade");
    const from = a.de ? resolvePeriod({ de: a.de }, ctx.now, "hoje").from : ctx.now;
    const slots = await availableSlots(unit.id, from, a.dias);
    const byDay = slots.reduce<Record<string, number>>((m, s) => ((m[iso(s.startsAt)] = (m[iso(s.startsAt)] ?? 0) + 1), m), {});
    return {
      data: { unidade: nome, de: iso(from), dias: a.dias, total_horarios_livres: slots.length, por_dia: byDay, primeiros: slots.slice(0, 10).map((s) => `${iso(s.startsAt)} ${fmtTime(s.startsAt)}${s.peak ? " (pico)" : ""}`) },
      card: { numbers: [{ label: "Horários livres", value: String(slots.length) }, { label: "Dias", value: String(a.dias) }], bars: Object.entries(byDay).map(([k, n]) => ({ label: fmtDate(atRecife(...(k.split("-").map(Number) as [number, number, number]))), value: n, display: String(n) })) },
    };
  },
};

const comparar = {
  name: "comparar",
  description: "Compara uma métrica entre dois períodos OU entre duas unidades: taxa de faltas (passado), receita prevista ou perda prevista (mês) ou ocupação.",
  schema: z.object({
    metrica: z.enum(["taxa_faltas", "receita_prevista", "perda_prevista", "ocupacao"]),
    periodos: z.array(z.enum(PERIODS)).length(2).optional().describe("Dois períodos; para receita/perda use este_mes, mes_que_vem ou mes_passado"),
    unidades: z.array(z.string().max(40)).length(2).optional(),
  }).refine((v) => !!v.periodos !== !!v.unidades, "Informe dois períodos ou duas unidades"),
  async run(a: { metrica: string; periodos?: Period[]; unidades?: string[] }, ctx: ToolCtx): Promise<ToolResult> {
    const sides = a.periodos ? a.periodos.map((p) => ({ periodo: p, unidade: undefined as string | undefined })) : a.unidades!.map((u) => ({ periodo: undefined as Period | undefined, unidade: u }));
    const values = await Promise.all(sides.map(async (s) => {
      if (a.metrica === "taxa_faltas") { const r = await faltasPorPeriodo.run({ periodo: s.periodo ?? "ultimos_90_dias", unidade: s.unidade }, ctx); return { lado: r.data.periodo + " · " + r.data.unidade, valor: r.data.taxa_faltas_pct as number, unidade_medida: "%", amostra: r.data.amostra }; }
      if (a.metrica === "ocupacao") { const r = await ocupacao.run({ periodo: s.periodo ?? "esta_semana", unidade: s.unidade }, ctx); return { lado: r.data.periodo + " · " + r.data.unidade, valor: r.data.ocupacao_pct as number, unidade_medida: "%", amostra: r.data.sessoes }; }
      const mes = s.periodo === "mes_que_vem" || s.periodo === "mes_passado" ? s.periodo : "este_mes";
      const r = await previsaoReceita.run({ mes, unidade: s.unidade }, ctx);
      return { lado: r.data.mes + " · " + r.data.unidade, valor: (a.metrica === "receita_prevista" ? r.data.receita_prevista_reais : r.data.perda_prevista_reais) as number, unidade_medida: "R$", amostra: r.data.sessoes_futuras };
    }));
    const diff = values[1].valor - values[0].valor;
    return {
      data: { metrica: a.metrica, a: values[0], b: values[1], diferenca_b_menos_a: r1(diff), variacao_pct: values[0].valor ? pct(diff / values[0].valor) : null },
      card: { bars: values.map((v) => ({ label: v.lado, value: v.valor, display: v.unidade_medida === "%" ? `${num(v.valor)}%` : brl(v.valor) })) },
    };
  },
};

const simular = {
  name: "simular_cenario",
  description: "Simula quanto a clínica deixaria de perder no mês com ações: reduzir faltas da 6ª sessão de convênio (pontos percentuais), lembretes interativos (% a menos de faltas não confirmadas) e levar pacientes do horário de pico para outro horário (%).",
  schema: z.object({
    reducao_faltas_6a_sessao_pp: z.number().min(0).max(50).default(0), reducao_por_lembretes_pct: z.number().min(0).max(100).default(0),
    migrar_pico_pct: z.number().min(0).max(100).default(0), mes: mesArg, unidade,
  }),
  async run(a: { reducao_faltas_6a_sessao_pp: number; reducao_por_lembretes_pct: number; migrar_pico_pct: number; mes: string; unidade?: string }, ctx: ToolCtx): Promise<ToolResult> {
    const ym = ymFrom(a.mes, ctx.now);
    const { unit, nome } = resolveUnit(ctx, a.unidade);
    const f = await financeiro(ym, unit?.id, 180);
    const s = simulateLoss(f.sim, { reduce6pp: a.reducao_faltas_6a_sessao_pp, remindersPct: a.reducao_por_lembretes_pct, saturdayPct: a.migrar_pico_pct });
    return {
      data: { mes: ym, unidade: nome, estimativa: true, sessoes_futuras: f.sim.length, perda_futura_hoje_reais: reais(s.before), perda_com_acoes_reais: reais(s.after), economia_reais: reais(s.saved), parametros: a },
      card: {
        numbers: [{ label: "Economia", value: brl(s.saved) }, { label: "Perda futura hoje", value: brl(s.before) }, { label: "Com as ações", value: brl(s.after) }],
        link: { href: ctx.user.role === "RECEPCAO" ? "/recepcao/previsoes" : "/admin?aba=financeiro", label: "Abrir o simulador" },
        export: { item: "simulacao", title: `Simulação · ${ym}`, filters: { unidade: nome, periodo: ym } },
      },
    };
  },
};

export const TOOLS: Tool[] = [faltasPorPeriodo, previsaoFaltas, previsaoReceita, riscoPaciente, maiorRisco, sessoesDoDia, ocupacao, renovacoes, listaEspera, trocas, pagamentos, horariosLivres, comparar, simular] as Tool[];

/** Formato de ferramentas da API de chat compatível com OpenAI (Groq e Gemini). */
export const toolSpecs = (tools: Tool[] = TOOLS) => tools.map((t) => ({
  type: "function" as const,
  function: { name: t.name, description: t.description, parameters: z.toJSONSchema(t.schema, { io: "input", unrepresentable: "any" }) },
}));

export async function newCtx(user: CurrentUser, now = new Date()): Promise<ToolCtx> {
  return { user, now, refs: new Map(), units: await listUnits() };
}

/** Valida e roda uma chamada; erro de parâmetro volta para o modelo como dado, não como exceção. */
export async function runTool(tools: Tool[], name: string, rawArgs: string, ctx: ToolCtx): Promise<{ ok: boolean; result: Record<string, unknown>; card?: Partial<Answer>; args?: unknown }> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) return { ok: false, result: { erro: `Ferramenta inexistente: ${name}. Use só as ferramentas listadas.` } };
  let json: unknown;
  try { json = rawArgs?.trim() ? JSON.parse(rawArgs) : {}; } catch { return { ok: false, result: { erro: "Argumentos não são um JSON válido. Refaça a chamada." } }; }
  // Llama às vezes manda null onde quer dizer "sem filtro"
  if (json && typeof json === "object") json = Object.fromEntries(Object.entries(json).filter(([, v]) => v !== null && v !== ""));
  const parsed = tool.schema.safeParse(json);
  if (!parsed.success) return { ok: false, result: { erro: "Parâmetros inválidos", detalhes: parsed.error.issues.map((i) => `${i.path.join(".") || "(raiz)"}: ${i.message}`) } };
  try {
    const r = await tool.run(parsed.data as never, ctx);
    return { ok: true, result: sanitize(r.data), card: r.card, args: parsed.data };
  } catch (e) {
    if (e instanceof ToolInputError) return { ok: false, result: { erro: e.message } };
    throw e;
  }
}
