/**
 * Provedores de IA gratuitos, todos pelo formato de chat da OpenAI (chat completions + tools).
 * Groq é o principal; Gemini, reserva opcional. Sem chave, a lista fica vazia e o assistente usa o modo básico.
 */

export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type ChatMsg =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
export type ChatRequest = { model: string; messages: ChatMsg[]; tools?: unknown[]; temperature: number; maxTokens: number; timeoutMs: number };
export type ChatReply = { content: string | null; toolCalls: ToolCall[] };

export interface ChatProvider {
  readonly id: "groq" | "gemini" | string;
  readonly label: string;
  /** Do mais capaz ao mais rápido: o 429 no primeiro faz cair para o segundo. */
  readonly models: string[];
  chat(req: ChatRequest): Promise<ChatReply>;
}

/** Limite do plano gratuito (HTTP 429). */
export class LimitError extends Error {
  constructor(public retryAfterSec: number | null) { super("limite"); }
}
/** O modelo gerou uma chamada de ferramenta que não é JSON válido (Groq: tool_use_failed). */
export class MalformedToolCall extends Error {}
export class ProviderError extends Error {}

export function openAICompatible(o: { id: string; label: string; url: string; key: string; models: string[] }): ChatProvider {
  return {
    id: o.id, label: o.label, models: o.models,
    async chat(req) {
      let r: Response;
      try {
        r = await fetch(o.url, {
          method: "POST",
          headers: { Authorization: `Bearer ${o.key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: req.model, messages: req.messages, temperature: req.temperature, max_tokens: req.maxTokens,
            ...(req.tools?.length ? { tools: req.tools, tool_choice: "auto", parallel_tool_calls: true } : {}),
          }),
          signal: AbortSignal.timeout(req.timeoutMs),
        });
      } catch {
        throw new ProviderError("rede ou tempo esgotado");
      }
      if (r.status === 429) {
        const ra = Number(r.headers.get("retry-after"));
        throw new LimitError(Number.isFinite(ra) && ra > 0 ? ra : null);
      }
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: { code?: string; message?: string } } | { error?: { code?: string } }[];
        const err = Array.isArray(body) ? body[0]?.error : body.error;
        if (r.status === 400 && /tool_use_failed|failed_generation|function/i.test(`${err?.code ?? ""} ${(err as { message?: string })?.message ?? ""}`)) throw new MalformedToolCall();
        throw new ProviderError(`HTTP ${r.status}`);
      }
      const j = (await r.json()) as { choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[] };
      const m = j.choices?.[0]?.message;
      if (!m) throw new ProviderError("resposta vazia");
      return { content: m.content ?? null, toolCalls: (m.tool_calls ?? []).map((c, i) => ({ ...c, id: c.id || `call_${i}`, type: "function" })) };
    },
  };
}

/** Lê o ambiente: ASSISTANT_PROVIDER=groq (padrão) com GROQ_API_KEY; Gemini só com GEMINI_API_KEY. "local" desliga a IA. */
export function providersFromEnv(env: Record<string, string | undefined> = process.env): ChatProvider[] {
  if ((env.ASSISTANT_PROVIDER ?? "groq") === "local") return [];
  const out: ChatProvider[] = [];
  if (env.GROQ_API_KEY)
    out.push(openAICompatible({
      id: "groq", label: "Groq", url: "https://api.groq.com/openai/v1/chat/completions", key: env.GROQ_API_KEY,
      models: [env.ASSISTANT_MODEL || "llama-3.3-70b-versatile", env.ASSISTANT_MODEL_FALLBACK || "llama-3.1-8b-instant"],
    }));
  if (env.GEMINI_API_KEY)
    out.push(openAICompatible({
      id: "gemini", label: "Gemini", url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", key: env.GEMINI_API_KEY,
      models: [env.GEMINI_MODEL || "gemini-2.5-flash"],
    }));
  return out;
}
