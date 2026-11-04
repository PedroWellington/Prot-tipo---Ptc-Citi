/**
 * Modo básico: entende a pergunta por regras e dicionário, sem modelo de linguagem (intenção + período, unidade, nome, tipo).
 * Também guarda o que a IA e o modo básico compartilham: frase fora do tema, verificação de números e sugestões.
 */

export const INTENTS = [
  "faltas_dia", "faltas_semana", "faltas_mes", "perda_mes", "receita_mes", "pacientes_risco", "risco_paciente", "horario_faltas", "reduzir_6a",
  "recuperar_lembretes", "unidade_perde", "dinheiro_semana",
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
  period: "hoje" | "amanha" | "semana_atual" | "proxima_semana" | "mes_atual" | "proximo_mes";
  unit: "BV" | "CF" | null;
  type: "PARTICULAR" | "CONVENIO" | null;
  name: string | null;
  /** Pergunta de seguimento sobre um paciente: a ação sugerida ou o que mais pesa no risco. */
  focus: "acao" | "fatores" | null;
};

/** Minúsculas e sem acento: "Sábado" e "sabado" são a mesma palavra. */
export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const has = (t: string, ...words: (string | RegExp)[]) => words.some((w) => (typeof w === "string" ? t.includes(w) : w.test(t)));

export function parseQuestion(raw: string): Parsed {
  const t = fixTypos(fold(raw));
  const unit = has(t, "boa viagem", /\bbv\b/) ? "BV" : has(t, "casa forte", /\bcf\b/) ? "CF" : null;
  const type = has(t, "convenio") ? "CONVENIO" : has(t, "particular") ? "PARTICULAR" : null;
  const nextMonth = has(t, "proximo mes", "mes que vem");
  const nextWeek = has(t, "proxima semana", "semana que vem");
  const week = nextWeek || has(t, "semana");
  const day = has(t, "amanha") ? "amanha" : has(t, /hoje/) ? "hoje" : null;
  const period = nextMonth ? "proximo_mes" : nextWeek ? "proxima_semana" : week ? "semana_atual" : day ?? "mes_atual";

  // "risco do paciente Fulano", "probabilidade de Fulano faltar", "ação você sugere para Fulano"
  const clean = (x?: string) => x?.replace(/[?.!]+$/, "").trim() || null;
  const rawName = clean(/(?:probabilidade|chance) (?:de |d[oa] )?(?:paciente )?(.+?) (?:faltar|vir|comparecer)\b/.exec(t)?.[1])
    ?? (has(t, "acao", "sugere") ? clean(/(?:para|pra) (?:o |a )?(?:paciente )?(.+)$/.exec(t)?.[1]) : null)
    ?? clean(/risco (?:d[oae]s? )?(?:paciente )?(.+)$/.exec(t)?.[1]);
  const name = rawName && !/^(de )?faltar|^alto|^maior|^dos pacientes|^pelo menos|^algu|^nenhum|^\d|^uma? |^[oa]s /.test(rawName) && rawName.length >= 2 ? rawName : null;
  const focus = has(t, "acao", "sugere", "o que fazer") ? "acao" : has(t, "pesa", "fatores", "por que", "porque") ? "fatores" : null;

  let intent: Intent | null = null;
  if (has(t, "reduzir", "diminuir", "como evitar", "como baixar") && has(t, /\b6\b/, "6a", "sexta sessao", "6ª")) intent = "reduzir_6a";
  else if (has(t, "recuper", "economiz") && has(t, "lembrete")) intent = "recuperar_lembretes";
  else if (has(t, "unidade") && has(t, "perde", "perda")) intent = "unidade_perde";
  else if (has(t, "horario", "faixa") && has(t, "falta")) intent = "horario_faltas";
  // "quantos pacientes vão faltar amanhã" é previsão do dia, não lista de risco
  else if (day && !week && !has(t, "risco") && has(t, "falta", "faltar", "faltam")) intent = "faltas_dia";
  else if (has(t, "pacientes") && has(t, "risco", "faltar")) intent = "pacientes_risco";
  else if (name) intent = "risco_paciente";
  else if (has(t, "dinheiro", "representa", "reais") && has(t, "falta")) intent = "dinheiro_semana";
  else if (has(t, "receita", "faturamento", "faturar", "receber")) intent = "receita_mes";
  else if (has(t, "perder", "perda", "prejuizo", "deixar de ganhar")) intent = "perda_mes";
  else if (has(t, "falta", "faltar", "ausencia")) intent = day && !week ? "faltas_dia" : week ? "faltas_semana" : "faltas_mes";
  return { intent, period, unit, type, name: intent === "risco_paciente" ? name : null, focus: intent === "risco_paciente" ? focus : null };
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

// ── Erros de digitação e sinônimos ───────────────────────────

/** Palavras que o entendimento local procura; uma letra trocada, faltando, sobrando ou invertida ainda casa. */
const VOCAB = [
  "falta", "faltas", "faltar", "faltam", "ausencia", "receita", "perda", "perder", "prejuizo", "paciente", "pacientes", "risco", "semana", "amanha",
  "previsao", "horario", "lembrete", "lembretes", "unidade", "convenio", "particular", "proxima", "probabilidade", "faturamento", "dinheiro", "reduzir",
];
const SYNONYMS: [RegExp, string][] = [[/\bno[- ]?shows?\b/g, "falta"], [/\bausencias?\b/g, "falta"], [/\bnao comparec\w*/g, "falta"]];

/** Distância de edição com troca de letras vizinhas (Damerau restrita): até 1 conta como a mesma palavra. */
function within1(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return false;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length] <= 1;
}

/** "faktar" → "faltar", "no-show" → "falta". Recebe o texto já sem acento e em minúsculas. */
export function fixTypos(t: string) {
  for (const [re, to] of SYNONYMS) t = t.replace(re, to);
  return t.split(" ").map((w) => {
    const core = w.replace(/[?.!,;:]+$/, "");
    if (core.length < 5 || VOCAB.includes(core)) return w;
    const hit = VOCAB.find((v) => within1(core, v));
    return hit ? w.replace(core, hit) : w;
  }).join(" ");
}

// ── Resposta fora do tema e verificação de números ───────────

export const OFF_TOPIC = "Não consigo responder essa pergunta com base nos dados cadastrados no sistema.";

/** Datas relativas que as ferramentas entendem (resolvidas no servidor, fuso de São Paulo). */
export const PERIODS = [
  "hoje", "amanha", "ontem", "esta_semana", "semana_que_vem", "semana_passada", "este_mes", "mes_que_vem", "mes_passado",
  "ultimos_7_dias", "ultimos_30_dias", "ultimos_90_dias", "ultimos_180_dias",
] as const;
export type Period = (typeof PERIODS)[number];

/** Números como aparecem no texto em português: "1.234,56", "37%", "0,8", "2026". Ignora os identificadores P-xxxxxx. */
export function extractNumbers(text: string): { raw: string; value: number; decimals: number }[] {
  const clean = text.replace(/\bP-[a-z]{6}\b/g, " ");
  const out: { raw: string; value: number; decimals: number }[] = [];
  for (const m of clean.matchAll(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+,\d+|\d+\.\d{1,2}(?!\d)|\d+/g)) {
    const raw = m[0];
    const pt = raw.includes(",") || /^\d{1,3}(\.\d{3})+$/.test(raw);
    const norm = pt ? raw.replace(/\./g, "").replace(",", ".") : raw;
    out.push({ raw, value: Number(norm), decimals: norm.includes(".") ? norm.split(".")[1].length : 0 });
  }
  return out;
}

/** Números que as ferramentas devolveram (inclusive dentro de textos e datas); frações também como porcentagem. */
export function allowedNumbers(sources: unknown[]): number[] {
  const out: number[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "number" && Number.isFinite(v)) { out.push(v); if (Math.abs(v) <= 1) out.push(v * 100); }
    else if (typeof v === "string") for (const n of extractNumbers(v)) out.push(n.value);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  sources.forEach(walk);
  return out;
}

/** Todo número da resposta precisa ter vindo das ferramentas (ou da pergunta), no arredondamento em que aparece. */
export function verifyNumbers(answer: string, sources: unknown[]) {
  const allowed = allowedNumbers(sources);
  const bad = extractNumbers(answer).filter((n) => {
    const tol = 0.5 * 10 ** -n.decimals + 1e-9;
    return !allowed.some((v) => Math.abs(v - n.value) <= tol);
  });
  return { ok: bad.length === 0, bad: bad.map((b) => b.raw) };
}

// ── Perguntas sugeridas ────────────────────────────────────────

/** Estado inicial: perguntas agrupadas por tema. */
export const GROUPS: { tema: string; perguntas: string[] }[] = [
  { tema: "Faltas", perguntas: ["Previsão de faltas da próxima semana", "Previsão de faltas do mês", "Qual horário tem mais faltas?"] },
  { tema: "Financeiro", perguntas: ["Quanto vou perder este mês?", "Qual a receita prevista do mês?", "Qual unidade perde mais?"] },
  { tema: "Pacientes", perguntas: ["Pacientes com maior risco de faltar", "Quem são os próximos pacientes de risco?"] },
  { tema: "Ações", perguntas: ["Como reduzir as faltas da 6ª sessão?", "Quanto eu recuperaria com lembretes?"] },
];

const GENERAL = GROUPS.flatMap((g) => g.perguntas);

/**
 * "Quer saber mais?": 3 a 4 perguntas ligadas ao assunto da resposta, sem repetir o que já foi perguntado.
 * `top` é o paciente de maior risco agora; `name`, o paciente da resposta. Só nomes, nunca CPF.
 */
export function followupsFor(intent: Intent | null, ctx: { top?: string | null; name?: string | null }, asked: string[]): string[] {
  const { top, name } = ctx;
  const byIntent: Record<Intent, (string | false | null | undefined)[]> = {
    faltas_dia: ["Previsão de faltas da próxima semana", "Quais pacientes têm maior risco?", "Quanto as faltas desta semana representam em dinheiro?"],
    faltas_semana: [top && `Qual a probabilidade de ${top} faltar?`, "Quais pacientes têm maior risco?", "Qual horário tem mais faltas?", "Quanto as faltas desta semana representam em dinheiro?"],
    faltas_mes: ["Quanto vou perder este mês?", "Quais pacientes têm maior risco?", "Qual unidade perde mais?", "Previsão de faltas da próxima semana"],
    perda_mes: ["Quanto eu recuperaria com lembretes?", "Qual unidade perde mais?", "Como reduzir as faltas da 6ª sessão?", "Qual a receita prevista do mês?"],
    receita_mes: ["Quanto vou perder este mês?", "Qual unidade perde mais?", "Quanto eu recuperaria com lembretes?"],
    pacientes_risco: [top && `Qual a probabilidade de ${top} faltar?`, top && `Qual ação você sugere para ${top}?`, "Qual horário tem mais faltas?", "Previsão de faltas da próxima semana"],
    risco_paciente: [name && `Qual ação você sugere para ${name}?`, name && `O que mais pesa no risco de ${name}?`, "Quem são os próximos pacientes de risco?", "Qual horário tem mais faltas?"],
    horario_faltas: ["Como reduzir as faltas da 6ª sessão?", "Quais pacientes têm maior risco?", "Previsão de faltas da próxima semana"],
    reduzir_6a: ["Quanto eu recuperaria com lembretes?", "Quanto vou perder este mês?", "Qual unidade perde mais?"],
    recuperar_lembretes: ["Como reduzir as faltas da 6ª sessão?", "Qual unidade perde mais?", "Quais pacientes têm maior risco?"],
    unidade_perde: ["Quanto eu recuperaria com lembretes?", "Qual horário tem mais faltas?", "Previsão de faltas do mês"],
    dinheiro_semana: ["Quanto vou perder este mês?", "Quanto eu recuperaria com lembretes?", "Quais pacientes têm maior risco?"],
  };
  const seen = new Set(asked.map(fold));
  const out: string[] = [];
  for (const q of [...(intent ? byIntent[intent] : []), ...GENERAL]) {
    if (!q || seen.has(fold(q)) || out.some((o) => fold(o) === fold(q))) continue;
    out.push(q);
    if (out.length === 4) break;
  }
  return out;
}

const BY_TOOL: Record<string, string[]> = {
  faltas_por_periodo: ["Qual horário tem mais faltas?", "Compare as faltas de Boa Viagem e Casa Forte", "Quantas faltas tivemos no mês passado?"],
  previsao_faltas: ["Qual a probabilidade de pelo menos 1 paciente faltar amanhã?", "Quais pacientes têm maior risco?", "Previsão de faltas da próxima semana"],
  previsao_receita_perda: ["Quanto vou perder este mês?", "Quanto eu recuperaria com lembretes?", "Qual unidade perde mais?"],
  risco_paciente: ["Quais pacientes têm maior risco?", "Quais sessões temos amanhã?"],
  pacientes_maior_risco: ["Qual a probabilidade de pelo menos 1 paciente faltar amanhã?", "Quais sessões temos amanhã?", "Como reduzir as faltas da 6ª sessão?"],
  sessoes_do_dia: ["Qual a probabilidade de pelo menos 1 paciente faltar amanhã?", "Qual a ocupação desta semana?", "Quais horários livres temos em Boa Viagem?"],
  ocupacao: ["Quais horários livres temos em Casa Forte?", "Quantas pessoas estão na lista de espera?", "Previsão de faltas da próxima semana"],
  renovacoes_convenio: ["Como reduzir as faltas da 6ª sessão?", "Quantas trocas estão pendentes?", "Quais pagamentos estão pendentes?"],
  lista_espera: ["Quais horários livres temos em Boa Viagem?", "Qual a ocupação desta semana?"],
  trocas: ["Quantas pessoas estão na lista de espera?", "Quais renovações de convênio estão pendentes?"],
  pagamentos_pendentes: ["Qual a receita prevista do mês?", "Quanto vou perder este mês?"],
  horarios_livres: ["Quantas pessoas estão na lista de espera?", "Qual a ocupação desta semana?"],
  comparar: ["Qual unidade perde mais?", "Qual horário tem mais faltas?"],
  simular_cenario: ["Quanto vou perder este mês?", "Quais renovações de convênio estão pendentes?"],
};

/** "Quer saber mais?" das respostas da IA: vem do assunto das ferramentas usadas, sem repetir o já perguntado. */
export function followupsForTools(tools: string[], asked: string[], max = 4): string[] {
  const seen = new Set(asked.map(fold));
  const out: string[] = [];
  for (const q of [...tools.flatMap((t) => BY_TOOL[t] ?? []), ...GENERAL]) {
    if (seen.has(fold(q)) || out.some((o) => fold(o) === fold(q))) continue;
    out.push(q);
    if (out.length === max) break;
  }
  return out;
}

/** Três perguntas que o assistente sabe responder, junto da resposta fora do tema. */
export const offTopicChoices = (asked: string[]) =>
  followupsForTools(["previsao_faltas", "previsao_receita_perda"], asked, 3).map((q) => ({ label: q, text: q }));

/** Nomes para sugestões e autocompletar: só o nome, do maior risco para o menor, sem repetição. */
export function starterNames(patients: { name: string; p: number }[]) {
  const names = [...new Set([...patients].sort((a, b) => b.p - a.p).map((p) => p.name))];
  return { top: names[0] ?? null, names };
}

/** Enquanto digita: "probabilidade da hel" → "Qual a probabilidade de Helvira Lindoval faltar?". */
export function autocomplete(text: string, names: string[], max = 5): string[] {
  const t = fold(text);
  if (t.length < 3) return [];
  const kw = /(probabilidade|chance|risco)(?: d[oae]s?| de)?(?: paciente)? ?(.*)$/.exec(t);
  const query = kw ? kw[2] : t.split(" ").slice(-2).join(" ");
  const risk = kw?.[1] === "risco";
  const hits = query.length >= 2 ? matchNames(query, names.map((name) => ({ name }))) : kw ? names.slice(0, max).map((name) => ({ name })) : [];
  return hits.slice(0, max).map((h) => (risk ? `Risco do paciente ${h.name}` : `Qual a probabilidade de ${h.name} faltar?`));
}

// ── Tamanho do painel ──────────────────────────────────────────

export type PanelSize = "compacto" | "ampliado";
export const SIZE_KEY = "mv-assistente-tamanho";
/** Lembra o último tamanho escolhido; armazenamento bloqueado volta ao compacto sem quebrar. */
export function readSize(store: Pick<Storage, "getItem"> | null | undefined): PanelSize {
  try { return store?.getItem(SIZE_KEY) === "ampliado" ? "ampliado" : "compacto"; } catch { return "compacto"; }
}
export function writeSize(store: Pick<Storage, "setItem"> | null | undefined, size: PanelSize) {
  try { store?.setItem(SIZE_KEY, size); } catch { /* armazenamento bloqueado: vale só nesta visita */ }
}
