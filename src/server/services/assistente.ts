import { followupsFor, matchNames, OFF_TOPIC, offTopicChoices, parseQuestion, starterNames, type Parsed } from "@/lib/assistente";
import { atLeastOneMiss, simulateLoss } from "@/lib/previsao";
import { DAY, fmtDate, fmtTime, fmtWeekShort, startOfRecifeDay } from "@/lib/time";
import type { CurrentUser } from "../auth/session";
import { audit, listUnits } from "../repositories/config";
import { currentMonth, financeiro, futureRisk, previsoes } from "./analytics";
import { dashboard } from "./metrics";

export type Answer = {
  text: string;
  numbers?: { label: string; value: string }[];
  bars?: { label: string; value: number; display: string }[];
  link?: { href: string; label: string };
  choices?: { label: string; text: string }[];
  /** "Quer saber mais?": perguntas ligadas ao assunto, sem as já feitas na conversa. */
  followups?: string[];
  /** Nome do item no PNG; ausente = resposta sem números (não exporta). */
  export?: { item: string; title: string; filters: { unidade: string; periodo: string } };
  /** Pacientes citados: o PNG os troca por iniciais, salvo "Incluir nomes". */
  names?: string[];
  /** "ia" = modelo de linguagem com ferramentas; "basico" = regras locais. */
  mode?: "ia" | "basico";
  provider?: string;
  /** Aviso discreto: "Modo básico" ou "Limite gratuito atingido, usando modo básico". */
  notice?: string;
  /** Texto com iniciais e identificadores (sem nomes), devolvido pelo navegador como contexto da próxima pergunta. */
  memo?: string;
  tools?: string[];
};

/**
 * Modo básico do assistente: entende por regras e dicionário (com correção de erros de digitação) e responde com os
 * mesmos cálculos de Análises. É o que roda sem chave de IA, quando o limite gratuito acaba ou quando a IA falha.
 * A IA (Groq/Gemini com ferramentas) fica em src/server/assistant.
 */
export interface AssistantProvider {
  readonly name: string;
  answer(text: string, user: CurrentUser, asked?: string[]): Promise<Answer>;
}

const pct = (n: number) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const num = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const nextMonth = () => {
  const [y, m] = currentMonth().split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};
const monthLabel = (ym: string) => { const [y, m] = ym.split("-"); return `${m}/${y}`; };

export class LocalAssistantProvider implements AssistantProvider {
  readonly name = "local";

  async answer(text: string, user: CurrentUser, asked: string[] = []): Promise<Answer> {
    const q = parseQuestion(text);
    if (!q.intent) return { text: OFF_TOPIC, choices: offTopicChoices([...asked, text]) };
    const a = await this.respond(q, user);
    // Nome real do paciente de maior risco agora (só o nome, nunca CPF)
    const top = (await previsoes(undefined, "atual", 180)).patients[0]?.name ?? null;
    return { ...a, followups: followupsFor(q.intent, { top, name: a.names?.length === 1 ? a.names[0] : null }, [...asked, text]) };
  }

  /** Primeira tela: nomes reais para "Experimente" e para o autocompletar. */
  async start() {
    const [a, b] = await Promise.all([previsoes(undefined, "atual", 180), previsoes(undefined, "proxima", 180)]);
    return starterNames([...a.patients, ...b.patients].map((p) => ({ name: p.name, p: p.p })));
  }

  private async respond(q: Parsed, user: CurrentUser): Promise<Answer> {
    const units = await listUnits();
    const unit = q.unit ? units.find((u) => u.code === q.unit) : undefined;
    const unidade = unit?.name ?? "Todas";
    const desk = user.role === "RECEPCAO";
    const tab = (aba: string) => (desk ? (aba === "financeiro" ? "/recepcao/previsoes#financeiro" : "/recepcao/previsoes") : `/admin?aba=${aba}`);

    switch (q.intent) {
      case "faltas_dia": {
        const today = startOfRecifeDay(new Date()).getTime();
        const from = new Date(q.period === "amanha" ? today + DAY : today), to = new Date(from.getTime() + DAY);
        const risk = await futureRisk(from, to, unit?.id);
        const rates = risk.sessions.map((s) => s.missRate);
        const one = atLeastOneMiss(rates);
        const exp = rates.reduce((a, r) => a + r, 0);
        const quando = q.period === "amanha" ? "amanhã" : "hoje";
        return {
          text: rates.length
            ? `Para ${quando} (${fmtDate(from)}, ${unidade.toLowerCase() === "todas" ? "todas as unidades" : unidade}) há ${rates.length} sessões agendadas. A chance estimada de pelo menos 1 paciente faltar é de ${pct(one.p)} (sensibilidade: ${pct(one.range[0])} a ${pct(one.range[1])}), com cerca de ${num(exp)} faltas esperadas. Método: 1 menos o produto das chances de comparecimento de cada sessão, com base em ${risk.sample} sessões dos últimos ${risk.historyDays} dias.`
            : `Não há sessões agendadas para ${quando} (${fmtDate(from)}) com esses filtros.`,
          numbers: rates.length ? [{ label: "Pelo menos 1 falta", value: pct(one.p) }, { label: "Faltas esperadas", value: num(exp) }, { label: "Sessões", value: String(rates.length) }] : undefined,
          link: { href: tab("previsoes"), label: "Ver detalhes" },
          export: rates.length ? { item: "previsao-faltas-dia", title: `Previsão de faltas · ${quando}`, filters: { unidade, periodo: fmtDate(from) } } : undefined,
        };
      }
      case "faltas_semana": {
        const semana = q.period === "proxima_semana" ? "proxima" : "atual";
        const d = await previsoes(unit?.id, semana, 180);
        const w = d.week;
        const top = w.byWeekday.reduce((a, b) => (b.expected > a.expected ? b : a), w.byWeekday[0] ?? { key: "–", expected: 0 });
        return {
          text: `${semana === "proxima" ? "Na próxima semana" : "Até o fim desta semana"} esperamos cerca de ${num(w.expected)} faltas em ${w.sessions} sessões (${pct(w.rate)}), entre ${num(w.p80[0])} e ${num(w.p80[1])} com 80% de confiança. O dia mais arriscado é ${top.key.toLowerCase()}.`,
          numbers: [{ label: "Faltas esperadas", value: num(w.expected) }, { label: "Faixa de 80%", value: `${num(w.p80[0])} a ${num(w.p80[1])}` }, { label: "Sessões", value: String(w.sessions) }, { label: "Taxa prevista", value: pct(w.rate) }],
          bars: w.byWeekday.map((g) => ({ label: g.key, value: g.expected, display: num(g.expected) })),
          link: { href: tab("previsoes"), label: "Ver detalhes" },
          export: { item: "previsao-faltas-semana", title: `Previsão de faltas · ${semana === "proxima" ? "próxima semana" : "esta semana"}`, filters: { unidade, periodo: semana === "proxima" ? "proxima-semana" : "semana-atual" } },
        };
      }
      case "faltas_mes": {
        const d = await previsoes(unit?.id, "atual", 180);
        const m = d.month;
        return {
          text: `Até o fim do mês esperamos cerca de ${num(m.expected)} faltas em ${m.sessions} sessões agendadas (${pct(m.rate)}), entre ${num(m.p80[0])} e ${num(m.p80[1])} com 80% de confiança.`,
          numbers: [{ label: "Faltas esperadas", value: num(m.expected) }, { label: "Faixa de 80%", value: `${num(m.p80[0])} a ${num(m.p80[1])}` }, { label: "Sessões", value: String(m.sessions) }, { label: "Taxa prevista", value: pct(m.rate) }],
          bars: m.byUnit.map((g) => ({ label: g.key, value: g.expected, display: num(g.expected) })),
          link: { href: tab("previsoes"), label: "Ver detalhes" },
          export: { item: "previsao-faltas-mes", title: "Previsão de faltas do mês", filters: { unidade, periodo: currentMonth() } },
        };
      }
      case "perda_mes":
      case "receita_mes": {
        const ym = q.period === "proximo_mes" ? nextMonth() : currentMonth();
        const f = await financeiro(ym, unit?.id, 180);
        const c = f.cards;
        const loss = q.intent === "perda_mes";
        const r = loss ? c.loss : c.revenue;
        return {
          text: loss
            ? `A perda prevista em ${monthLabel(ym)} é de ${brl(r.expected)} (80%: ${brl(r.p80[0])} a ${brl(r.p80[1])}). Já se perderam ${brl(c.pastLoss)} com faltas e desmarcações tardias; o resto é o risco das ${c.futureCount} sessões ainda agendadas.`
            : `A receita prevista para ${monthLabel(ym)} é de ${brl(r.expected)} (80%: ${brl(r.p80[0])} a ${brl(r.p80[1])}). Já entraram ${brl(c.realized)} em sessões realizadas${c.attendance !== null ? `, e o comparecimento previsto nas próximas é de ${pct(c.attendance)}` : ""}.`,
          numbers: loss
            ? [{ label: "Perda prevista", value: brl(r.expected) }, { label: "Faixa de 80%", value: `${brl(r.p80[0])} a ${brl(r.p80[1])}` }, { label: "Já perdido", value: brl(c.pastLoss) }]
            : [{ label: "Receita prevista", value: brl(r.expected) }, { label: "Faixa de 80%", value: `${brl(r.p80[0])} a ${brl(r.p80[1])}` }, { label: "Já realizada", value: brl(c.realized) }],
          bars: f.breakdowns.unidade.map((g) => ({ label: g.key, value: loss ? g.totalLoss : g.scheduled - g.expectedLoss, display: brl(loss ? g.totalLoss : g.scheduled - g.expectedLoss) })),
          link: { href: tab("financeiro"), label: "Ver detalhes" },
          export: { item: loss ? "perda-prevista" : "receita-prevista", title: `${loss ? "Perda" : "Receita"} prevista · ${monthLabel(ym)}`, filters: { unidade, periodo: ym } },
        };
      }
      case "pacientes_risco": {
        const d = await previsoes(unit?.id, q.period === "proxima_semana" ? "proxima" : "atual", 180);
        const top = d.patients.filter((p) => p.level !== "baixo").slice(0, 5);
        await audit(user.id, "RISCO_PACIENTES_CONSULTADO", "Assistente", null, { pacientes: top.length });
        if (!top.length) return { text: "Nenhum paciente com risco médio ou alto nas sessões desta semana.", link: { href: tab("previsoes"), label: "Ver detalhes" } };
        return {
          text: `Maiores riscos de falta nas próximas sessões (estimativas, não certezas):\n${top.map((p, i) => `${i + 1}. ${p.name}: ${pct(p.p)}, ${p.factors.slice(0, 2).join(", ") || "taxa do grupo"}. Sugestão: ${p.action.toLowerCase()}.`).join("\n")}`,
          bars: top.map((p) => ({ label: p.name, value: p.p * 100, display: pct(p.p) })),
          link: { href: tab("previsoes"), label: "Ver detalhes" },
          export: { item: "pacientes-maior-risco", title: "Pacientes com maior risco de faltar", filters: { unidade, periodo: "semana-atual" } },
          names: top.map((p) => p.name),
        };
      }
      case "risco_paciente":
        return this.patient(q, user, unit?.id, unidade, tab("previsoes"));
      case "horario_faltas": {
        const to = new Date(), from = new Date(to.getTime() - 180 * 86_400_000);
        const d = await dashboard(from, to, unit?.id);
        const worst = d.byHourBand.reduce((a, b) => (b.rate > a.rate ? b : a));
        return {
          text: `Nos últimos 6 meses, a faixa com mais faltas é ${worst.key}, com ${num(worst.rate)}% das sessões. ${d.byHourBand.map((b) => `${b.key}: ${num(b.rate)}%`).join(" · ")}.`,
          bars: d.byHourBand.map((b) => ({ label: b.key, value: b.rate, display: `${num(b.rate)}%` })),
          link: { href: desk ? "/recepcao/previsoes" : "/admin?aba=faltas", label: "Ver detalhes" },
          export: { item: "faltas-por-horario", title: "Faltas por faixa de horário", filters: { unidade, periodo: "6-meses" } },
        };
      }
      case "reduzir_6a": {
        const f = await financeiro(currentMonth(), unit?.id, 180);
        const s = simulateLoss(f.sim, { reduce6pp: 15, remindersPct: 20, saturdayPct: 0 });
        const only6 = simulateLoss(f.sim, { reduce6pp: 15, remindersPct: 0, saturdayPct: 0 });
        return {
          text: `A 6ª sessão de convênio é quando a autorização acaba e a falta salta. Três ações do protótipo atacam isso: pedir a renovação já na 3ª sessão (antecipada), confirmação interativa nos lembretes e manter o horário guardado enquanto o convênio analisa. Neste mês, reduzir 15 pontos na falta da 6ª sessão pouparia cerca de ${brl(only6.saved)}; somando lembretes que cortam 20% das faltas não confirmadas, ${brl(s.saved)}.`,
          numbers: [{ label: "Só a renovação antecipada", value: brl(only6.saved) }, { label: "Com lembretes interativos", value: brl(s.saved) }, { label: "Perda futura hoje", value: brl(s.before) }],
          link: { href: desk ? "/recepcao/previsoes" : "/admin?aba=financeiro", label: "Abrir o simulador" },
          export: { item: "reduzir-faltas-6a-sessao", title: "Como reduzir as faltas da 6ª sessão", filters: { unidade, periodo: currentMonth() } },
        };
      }
      case "recuperar_lembretes": {
        const f = await financeiro(currentMonth(), unit?.id, 180);
        const r20 = simulateLoss(f.sim, { reduce6pp: 0, remindersPct: 20, saturdayPct: 0 });
        const r35 = simulateLoss(f.sim, { reduce6pp: 0, remindersPct: 35, saturdayPct: 0 });
        const open = f.sim.filter((s) => !s.confirmed).length;
        return {
          text: `Há ${open} sessões ainda sem confirmação neste mês. Se os lembretes interativos cortarem 20% das faltas delas, você recuperaria cerca de ${brl(r20.saved)}; com 35%, ${brl(r35.saved)}. A perda futura esperada hoje é ${brl(r20.before)}.`,
          numbers: [{ label: "Com 20% menos faltas", value: brl(r20.saved) }, { label: "Com 35% menos faltas", value: brl(r35.saved) }, { label: "Perda futura hoje", value: brl(r20.before) }, { label: "Sessões sem confirmação", value: String(open) }],
          link: { href: desk ? "/recepcao/previsoes" : "/admin?aba=financeiro", label: "Abrir o simulador" },
          export: { item: "recuperar-com-lembretes", title: "Quanto os lembretes recuperariam", filters: { unidade, periodo: currentMonth() } },
        };
      }
      case "unidade_perde": {
        const f = await financeiro(currentMonth(), undefined, 180);
        const rows = f.breakdowns.unidade;
        const worst = rows[0];
        return {
          text: worst ? `${worst.key} perde mais neste mês: ${brl(worst.totalLoss)} entre perdas já ocorridas (${brl(worst.pastLoss)}) e previstas (${brl(worst.expectedLoss)}). ${rows.slice(1).map((r) => `${r.key}: ${brl(r.totalLoss)}`).join(" · ")}.` : "Ainda não há perdas registradas ou previstas neste mês.",
          bars: rows.map((r) => ({ label: r.key, value: r.totalLoss, display: brl(r.totalLoss) })),
          numbers: worst ? [{ label: `Perda em ${worst.key}`, value: brl(worst.totalLoss) }, { label: "Já ocorrida", value: brl(worst.pastLoss) }, { label: "Prevista", value: brl(worst.expectedLoss) }] : undefined,
          link: { href: tab("financeiro"), label: "Ver detalhes" },
          export: { item: "perda-por-unidade", title: "Perda por unidade no mês", filters: { unidade: "Todas", periodo: currentMonth() } },
        };
      }
      case "dinheiro_semana": {
        const semana = q.period === "proxima_semana" ? "proxima" : "atual";
        const w = (await previsoes(unit?.id, semana, 180)).week;
        return {
          text: `As ${num(w.expected)} faltas esperadas ${semana === "proxima" ? "na próxima semana" : "até o fim desta semana"} representam cerca de ${brl(w.expectedLoss)} que a clínica deixaria de receber, em ${w.sessions} sessões agendadas.`,
          numbers: [{ label: "Valor em risco", value: brl(w.expectedLoss) }, { label: "Faltas esperadas", value: num(w.expected) }, { label: "Faixa de 80%", value: `${num(w.p80[0])} a ${num(w.p80[1])} faltas` }],
          bars: w.byUnit.map((g) => ({ label: g.key, value: g.expected, display: `${num(g.expected)} faltas` })),
          link: { href: tab("previsoes"), label: "Ver detalhes" },
          export: { item: "faltas-semana-em-dinheiro", title: "Faltas da semana em dinheiro", filters: { unidade, periodo: semana === "proxima" ? "proxima-semana" : "semana-atual" } },
        };
      }
      default:
        return { text: OFF_TOPIC, choices: offTopicChoices([]) };
    }
  }

  private async patient(q: Parsed, user: CurrentUser, unitId: string | undefined, unidade: string, href: string): Promise<Answer> {
    const [a, b] = await Promise.all([previsoes(unitId, "atual", 180), previsoes(unitId, "proxima", 180)]);
    const people = [...a.patients, ...b.patients.filter((p) => !a.patients.some((x) => x.patientId === p.patientId))];
    const found = matchNames(q.name ?? "", people);
    if (!found.length) return { text: `Não achei "${q.name}" entre os pacientes com sessão nas próximas duas semanas. Confira o nome ou veja a lista completa.`, link: { href, label: "Ver lista de risco" } };
    if (found.length > 1)
      return {
        text: `Encontrei ${found.length} pacientes com esse nome. Qual deles?`,
        choices: found.slice(0, 6).map((p) => ({ label: p.name, text: `Risco do paciente ${p.name}` })),
      };
    const p = found[0];
    await audit(user.id, "RISCO_PACIENTE_CONSULTADO", "PatientProfile", p.patientId, { via: "assistente" });
    const level = p.level === "alto" ? "alto" : p.level === "medio" ? "médio" : "baixo";
    const base = `chance estimada de ${pct(p.p)} de faltar na próxima sessão (${fmtWeekShort(p.startsAt)} às ${fmtTime(p.startsAt)}, ${p.unit})`;
    const text = q.focus === "acao"
      ? `Para ${p.name} (${base}), a ação sugerida é: ${p.action.toLowerCase()}. ${p.level === "baixo" ? "O risco é baixo; o lembrete automático costuma bastar." : "Fazer isso até a véspera dá tempo de oferecer o horário à lista de espera se não der certo."}`
      : q.focus === "fatores"
        ? `O que mais pesa no risco de ${p.name} (${pct(p.p)}): ${p.factors.length ? p.factors.join("; ") : "nada fora do comum; vale a taxa do grupo"}. A base é a taxa do grupo (${pct(p.segmentRate)}), ajustada pelo histórico próprio de ${p.sample} sessões (confiança ${p.confidence}).`
        : `${p.name}: ${base}. Risco ${level}, confiança ${p.confidence} (${p.sample} sessões de histórico). ${p.factors.length ? `Fatores: ${p.factors.join(", ")}.` : "Sem fatores de alerta; vale a taxa do grupo."} Sugestão: ${p.action.toLowerCase()}.`;
    return {
      text,
      numbers: [{ label: "Chance de faltar", value: pct(p.p) }, { label: "Taxa do grupo", value: pct(p.segmentRate) }, { label: "Confiança", value: p.confidence }, { label: "Próxima sessão", value: `${fmtDate(p.startsAt)} ${fmtTime(p.startsAt)}` }],
      link: { href, label: "Ver detalhes" },
      // O nome não entra no arquivo: o PNG pode circular fora da clínica
      export: { item: "risco-paciente", title: `Risco de falta · ${p.name}`, filters: { unidade, periodo: "proxima-sessao" } },
      names: [p.name],
    };
  }
}

export const local = new LocalAssistantProvider();
