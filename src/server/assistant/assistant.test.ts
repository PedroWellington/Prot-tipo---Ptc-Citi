import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { fixTypos, fold, OFF_TOPIC, parseQuestion, verifyNumbers } from "@/lib/assistente";
import { atLeastOneMiss } from "@/lib/previsao";
import type { CurrentUser } from "../auth/session";
import { local } from "../services/assistente";
import { askAssistant, BASIC_NOTICE, LIMIT_NOTICE, type Deps } from "./engine";
import { LimitError, MalformedToolCall, type ChatProvider, type ChatReply } from "./llm";
import { refOf, resolvePeriod, runTool, sanitize, TOOLS, type Tool, type ToolCtx } from "./tools";

const user = { id: "u1", role: "ADMIN", name: "Admin", unitId: null, physio: null, patient: null } as unknown as CurrentUser;
const ctx = (): ToolCtx => ({ user, now: new Date("2026-11-04T15:00:00Z"), refs: new Map(), units: [] });

/** Ferramenta de teste: devolve números fixos e um paciente por iniciais. */
const fakeTool: Tool = {
  name: "previsao_faltas", description: "teste",
  schema: z.object({ periodo: z.enum(["amanha", "hoje"]).optional() }),
  run: (async (_a: unknown, c: ToolCtx) => {
    c.refs.set(refOf("pac1"), "Maria da Silva");
    return { data: { faltas_esperadas: 2.4, sessoes_agendadas: 18, chance_pelo_menos_1_falta_pct: 91.3, paciente: { ref: refOf("pac1"), iniciais: "M.S." } }, card: { numbers: [{ label: "Pelo menos 1 falta", value: "91,3%" }] } };
  }) as never,
};

const call = (name: string, args: unknown) => ({ id: "c1", type: "function" as const, function: { name, arguments: JSON.stringify(args) } });
/** Provedor simulado: cada chamada consome a próxima resposta (ou erro) da fila. Nunca chama a API real. */
function mockProvider(id: string, models: string[], script: (ChatReply | Error)[]) {
  const seen: string[] = [];
  const p: ChatProvider = {
    id, label: id === "groq" ? "Groq" : "Gemini", models,
    async chat(req) {
      seen.push(req.model);
      const next = script.shift() ?? new LimitError(null);
      if (next instanceof Error) throw next;
      return next;
    },
  };
  return { p, seen };
}

const deps = (providers: ChatProvider[], over: Partial<Deps> = {}): Deps => ({
  providers, tools: [fakeTool], ctx: async () => ctx(),
  basic: async () => ({ text: "resposta do modo básico" }),
  limits: async () => null, audit: vi.fn(async () => {}), resolveRefs: async () => new Map(), sleep: async () => {}, now: () => new Date(),
  ...over,
});
const ask = (text: string) => ({ text, asked: [], history: [] });

describe("Assistente com IA (provedor simulado)", () => {
  it("chama a ferramenta, confere os números e troca as iniciais pelo nome completo", async () => {
    const { p } = mockProvider("groq", ["llama-3.3-70b-versatile"], [
      { content: null, toolCalls: [call("previsao_faltas", { periodo: "amanha" })] },
      { content: `Estimativa para amanhã: chance de 91,3% de pelo menos 1 falta em 18 sessões (cerca de 2,4 faltas). Maior risco: M.S. (${refOf("pac1")}).`, toolCalls: [] },
    ]);
    const a = await askAssistant(ask("teste 1"), user, deps([p]));
    expect(a.mode).toBe("ia");
    expect(a.text).toContain("Maria da Silva");
    expect(a.text).not.toContain("P-");
    expect(a.memo).toContain("M.S.");
    expect(a.memo).not.toContain("Maria");
    expect(a.numbers?.[0].value).toBe("91,3%");
    expect(a.followups?.length).toBeGreaterThan(0);
  });

  it("rejeita resposta com número que não veio das ferramentas e cai no modo básico se insistir", async () => {
    const { p } = mockProvider("groq", ["m1"], [
      { content: null, toolCalls: [call("previsao_faltas", {})] },
      { content: "Teremos 7 faltas amanhã.", toolCalls: [] },
      { content: "Teremos umas 7 faltas.", toolCalls: [] },
    ]);
    const a = await askAssistant(ask("teste 2"), user, deps([p]));
    expect(a.mode).toBe("basico");
    expect(a.text).toBe("resposta do modo básico");
  });

  it("aceita a resposta reescrita só com os números das ferramentas", async () => {
    const { p } = mockProvider("groq", ["m1"], [
      { content: null, toolCalls: [call("previsao_faltas", {})] },
      { content: "Teremos 7 faltas amanhã.", toolCalls: [] },
      { content: "Estimativa: 2,4 faltas em 18 sessões.", toolCalls: [] },
    ]);
    const a = await askAssistant(ask("teste 3"), user, deps([p]));
    expect(a.mode).toBe("ia");
    expect(a.text).toBe("Estimativa: 2,4 faltas em 18 sessões.");
  });

  it("pergunta fora do tema devolve exatamente a frase definida e 3 sugestões", async () => {
    const { p } = mockProvider("groq", ["m1"], [{ content: `${OFF_TOPIC} Posso ajudar com faltas.`, toolCalls: [] }]);
    const a = await askAssistant(ask("qual a capital da França?"), user, deps([p]));
    expect(a.text).toBe("Não consigo responder essa pergunta com base nos dados cadastrados no sistema.");
    expect(a.choices).toHaveLength(3);
  });

  it("429 aciona a cadeia: espera e tenta de novo, modelo menor, provedor reserva e enfim o modo básico", async () => {
    const sleep = vi.fn(async () => {});
    const groq = mockProvider("groq", ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"], [new LimitError(1), new LimitError(1), new LimitError(null), new LimitError(null)]);
    const gemini = mockProvider("gemini", ["gemini-2.5-flash"], [new LimitError(null), new LimitError(null)]);
    const a = await askAssistant(ask("teste 429"), user, deps([groq.p, gemini.p], { sleep }));
    expect(groq.seen).toEqual(["llama-3.3-70b-versatile", "llama-3.3-70b-versatile", "llama-3.1-8b-instant", "llama-3.1-8b-instant"]);
    expect(gemini.seen).toEqual(["gemini-2.5-flash", "gemini-2.5-flash"]);
    expect(sleep).toHaveBeenCalledTimes(3);
    expect(a.mode).toBe("basico");
    expect(a.notice).toBe(LIMIT_NOTICE);
  });

  it("429 no modelo grande e sucesso no menor", async () => {
    const groq = mockProvider("groq", ["grande", "menor"], [new LimitError(null), new LimitError(null), { content: "Sem números aqui.", toolCalls: [] }]);
    const a = await askAssistant(ask("teste menor"), user, deps([groq.p]));
    expect(a.mode).toBe("ia");
    expect(groq.seen).toEqual(["grande", "grande", "menor"]);
  });

  it("chamada de ferramenta malformada: tenta de novo uma vez", async () => {
    const groq = mockProvider("groq", ["m1"], [new MalformedToolCall(), { content: "De qual unidade?", toolCalls: [] }]);
    const a = await askAssistant(ask("horários livres"), user, deps([groq.p]));
    expect(a.text).toBe("De qual unidade?");
    expect(groq.seen).toHaveLength(2);
  });

  it("sem chave de IA funciona no modo básico, avisando", async () => {
    const a = await askAssistant(ask("Previsão de faltas do mês"), user, deps([]));
    expect(a.mode).toBe("basico");
    expect(a.notice).toBe(BASIC_NOTICE);
  });

  it("limite diário estourado: modo básico com o aviso de limite, sem erro", async () => {
    const groq = mockProvider("groq", ["m1"], []);
    const a = await askAssistant(ask("teste limite"), user, deps([groq.p], { limits: async () => "global" }));
    expect(a.notice).toBe(LIMIT_NOTICE);
    expect(groq.seen).toEqual([]);
  });

  it("registra a consulta na auditoria sem os dados devolvidos", async () => {
    const audit = vi.fn(async () => {});
    const { p } = mockProvider("groq", ["m1"], [{ content: null, toolCalls: [call("previsao_faltas", {})] }, { content: "Estimativa de 2,4 faltas.", toolCalls: [] }]);
    await askAssistant(ask("teste auditoria"), user, deps([p], { audit }));
    const meta = (audit.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(meta).toMatchObject({ pergunta: "teste auditoria", ferramentas: ["previsao_faltas"], provedor: "Groq", modo: "ia" });
    expect(JSON.stringify(meta)).not.toContain("2.4");
  });
});

describe("Ferramentas", () => {
  it("validam os parâmetros com Zod e devolvem o erro ao modelo como dado", async () => {
    expect((await runTool(TOOLS, "previsao_faltas", JSON.stringify({ periodo: "ano_que_vem" }), ctx())).result.erro).toBe("Parâmetros inválidos");
    expect((await runTool(TOOLS, "pacientes_maior_risco", JSON.stringify({ limite: 500 }), ctx())).ok).toBe(false);
    expect((await runTool(TOOLS, "horarios_livres", "{}", ctx())).ok).toBe(false);
    expect((await runTool(TOOLS, "previsao_faltas", "{periodo: amanha", ctx())).result.erro).toMatch(/JSON/);
    expect((await runTool(TOOLS, "apagar_tudo", "{}", ctx())).result.erro).toMatch(/inexistente/);
  });
  it("só existem ferramentas de leitura", () => {
    expect(TOOLS.map((t) => t.name)).toEqual([
      "faltas_por_periodo", "previsao_faltas", "previsao_receita_perda", "risco_paciente", "pacientes_maior_risco", "sessoes_do_dia", "ocupacao",
      "renovacoes_convenio", "lista_espera", "trocas", "pagamentos_pendentes", "horarios_livres", "comparar", "simular_cenario",
    ]);
  });
  it("nunca devolvem CPF, telefone ou e-mail ao modelo", async () => {
    const leaky: Tool = {
      name: "vaza", description: "", schema: z.object({}),
      run: (async () => ({ data: { cpf: "123.456.789-09", phone: "81999998888", email: "a@b.test", nome: "Maria", obs: "ligar 81 99999-8888 ou a@b.test, CPF 12345678909", ok: 3 } })) as never,
    };
    const r = await runTool([leaky], "vaza", "{}", ctx());
    expect(r.result).toEqual({ obs: "ligar [removido] ou [removido], CPF [removido]", ok: 3 });
    expect(sanitize({ lista: [{ telefone: "1", iniciais: "M.S." }] })).toEqual({ lista: [{ iniciais: "M.S." }] });
  });
  it("datas relativas pelo fuso de São Paulo", () => {
    const now = new Date("2026-11-05T02:30:00Z"); // 23h30 do dia 4 em São Paulo
    const p = resolvePeriod({ periodo: "amanha" }, now, "hoje");
    expect(p.from.toISOString()).toBe("2026-11-05T03:00:00.000Z");
    expect(p.to.toISOString()).toBe("2026-11-06T03:00:00.000Z");
    const w = resolvePeriod({ periodo: "semana_que_vem" }, now, "hoje");
    expect(w.from.toISOString()).toBe("2026-11-09T03:00:00.000Z"); // segunda
    expect(resolvePeriod({ periodo: "mes_passado" }, now, "hoje").from.toISOString()).toBe("2026-10-01T03:00:00.000Z");
  });
  it("identificador do paciente é estável e só tem letras", () => {
    expect(refOf("abc")).toBe(refOf("abc"));
    expect(refOf("abc")).toMatch(/^P-[a-z]{6}$/);
  });
});

describe("Entendimento e contas", () => {
  it("entende erro de digitação e sinônimos", () => {
    expect(fixTypos(fold("qual a chance de alguem faktar amanha?"))).toContain("faltar");
    const q = parseQuestion("Qual a probabilidade de pelo menos 1 paciente faktar amanhã?");
    expect(q.intent).toBe("faltas_dia");
    expect(q.period).toBe("amanha");
    expect(parseQuestion("quantos no-show na semana que vem em BV").intent).toBe("faltas_semana");
    expect(parseQuestion("quantos no-show na semana que vem em BV").unit).toBe("BV");
    expect(parseQuestion("ausências do mês").intent).toBe("faltas_mes");
    expect(parseQuestion("quantos pacientes vão faktar amanhã em BV?")).toMatchObject({ intent: "faltas_dia", period: "amanha", unit: "BV" });
    expect(parseQuestion("Pacientes com maior risco de faltar").intent).toBe("pacientes_risco");
  });
  it("modo básico: fora do tema devolve a frase exata", async () => {
    const a = await local.answer("Qual a capital da França?", user);
    expect(a.text).toBe(OFF_TOPIC);
    expect(a.choices).toHaveLength(3);
  });
  it("verificação de números: aceita os das ferramentas no arredondamento mostrado e recusa os inventados", () => {
    const src = [{ taxa_faltas_pct: 37.14, receita_reais: 12345, chance: 0.913, de: "2026-11-05" }];
    expect(verifyNumbers("Taxa de 37,1% (cerca de 37%), receita de R$ 12.345 e chance de 91%, no dia 05/11/2026.", src).ok).toBe(true);
    const bad = verifyNumbers("A taxa foi 42% e a receita R$ 12.900.", src);
    expect(bad.ok).toBe(false);
    expect(bad.bad).toEqual(["42", "12.900"]);
  });
  it("probabilidade de pelo menos 1 falta bate com a conta manual", () => {
    const r = atLeastOneMiss([0.1, 0.2, 0.3]);
    expect(r.p).toBeCloseTo(1 - 0.9 * 0.8 * 0.7, 10); // 0,496
    expect(r.range[0]).toBeCloseTo(1 - 0.92 * 0.84 * 0.76, 10);
    expect(r.range[1]).toBeCloseTo(1 - 0.88 * 0.76 * 0.64, 10);
    expect(atLeastOneMiss([]).p).toBe(0);
  });
});
