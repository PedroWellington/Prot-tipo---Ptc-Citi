/**
 * Entende a pergunta por regras e dicionário, sem modelo de linguagem: intenção + entidades (período, unidade, nome, tipo).
 * Tudo roda no servidor da clínica; nenhum texto sai para serviços externos.
 */

export const INTENTS = [
  "faltas_semana", "faltas_mes", "perda_mes", "receita_mes", "pacientes_risco", "risco_paciente", "horario_faltas", "reduzir_6a",
] as const;
export type Intent = (typeof INTENTS)[number];

export const SHORTCUTS: { label: string; text: string }[] = [
  { label: "Previsão de faltas da próxima semana", text: "Previsão de faltas da próxima semana" },
  { label: "Previsão de faltas do mês", text: "Previsão de faltas do mês" },
  { label: "Quanto vou perder este mês?", text: "Quanto vou perder este mês?" },
  { label: "Qual a receita prevista do mês?", text: "Qual a receita prevista do mês?" },
  { label: "Pacientes com maior risco de faltar", text: "Pacientes com maior risco de faltar" },
  { label: "Risco do paciente [nome]", text: "Risco do paciente " },
  { label: "Qual horário tem mais faltas?", text: "Qual horário tem mais faltas?" },
  { label: "Como reduzir as faltas da 6ª sessão?", text: "Como reduzir as faltas da 6ª sessão?" },
];

export type Parsed = {
  intent: Intent | null;
  period: "semana_atual" | "proxima_semana" | "mes_atual" | "proximo_mes";
  unit: "BV" | "CF" | null;
  type: "PARTICULAR" | "CONVENIO" | null;
  name: string | null;
};

/** Minúsculas e sem acento: "Sábado" e "sabado" são a mesma palavra. */
export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const has = (t: string, ...words: (string | RegExp)[]) => words.some((w) => (typeof w === "string" ? t.includes(w) : w.test(t)));

export function parseQuestion(raw: string): Parsed {
  const t = fold(raw);
  const unit = has(t, "boa viagem", /\bbv\b/) ? "BV" : has(t, "casa forte", /\bcf\b/) ? "CF" : null;
  const type = has(t, "convenio") ? "CONVENIO" : has(t, "particular") ? "PARTICULAR" : null;
  const nextMonth = has(t, "proximo mes", "mes que vem");
  const nextWeek = has(t, "proxima semana", "semana que vem");
  const week = nextWeek || has(t, "semana");
  const period = nextMonth ? "proximo_mes" : nextWeek ? "proxima_semana" : week ? "semana_atual" : "mes_atual";

  // "risco do paciente Fulano", "risco da Fulana", "Fulano vai faltar?"
  const nameMatch = /risco (?:d[oae]s? )?(?:paciente )?(.+)$/.exec(t);
  const rawName = nameMatch?.[1]?.replace(/[?.!]+$/, "").trim() ?? null;
  const name = rawName && !/^(de )?faltar|^alto|^maior|^dos pacientes/.test(rawName) && rawName.length >= 2 ? rawName : null;

  let intent: Intent | null = null;
  if (has(t, "reduzir", "diminuir", "como evitar", "como baixar") && has(t, /\b6\b/, "6a", "sexta sessao", "6ª")) intent = "reduzir_6a";
  else if (has(t, "horario", "faixa") && has(t, "falta")) intent = "horario_faltas";
  else if (has(t, "pacientes") && has(t, "risco", "faltar")) intent = "pacientes_risco";
  else if (name) intent = "risco_paciente";
  else if (has(t, "receita", "faturamento", "faturar", "receber")) intent = "receita_mes";
  else if (has(t, "perder", "perda", "prejuizo", "deixar de ganhar")) intent = "perda_mes";
  else if (has(t, "falta", "faltar", "ausencia")) intent = week ? "faltas_semana" : "faltas_mes";
  return { intent, period, unit, type, name: intent === "risco_paciente" ? name : null };
}

/** Pacientes cujo nome contém todas as palavras buscadas (sem acento). Mais de um: o assistente pede confirmação. */
export function matchNames<T extends { name: string }>(query: string, people: T[]) {
  const words = fold(query).split(" ").filter((w) => w.length > 1);
  if (!words.length) return [];
  const exact = people.filter((p) => fold(p.name) === fold(query));
  if (exact.length) return exact;
  return people.filter((p) => {
    const n = fold(p.name).split(" ");
    return words.every((w) => n.some((part) => part.startsWith(w)));
  });
}
