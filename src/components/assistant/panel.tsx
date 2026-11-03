"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowUp, ExternalLink, History, Maximize2, Minimize2, RotateCcw, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { api } from "@/lib/api";
import { autocomplete, fold, GROUPS, readSize, writeSize, type PanelSize } from "@/lib/assistente";
import type { ExportSpec } from "@/lib/exportar";
import type { Answer } from "@/server/services/assistente";
import { HBars } from "../analises/shared";
import { ExportButton } from "../export-png";
import { cx, Skeleton } from "../ui";

type Msg = { id: number; role: "user" | "bot"; text: string; answer?: Answer };

/** Imagem de uma resposta: números como cartões, barras como gráfico, o texto como nota. */
const specOf = (a: Answer): ExportSpec => ({
  item: a.export!.item, title: a.export!.title, filters: a.export!.filters,
  body: a.numbers?.length ? { kind: "stats", items: a.numbers } : { kind: "text", lines: [a.text] },
  extra: a.bars?.length ? { kind: "bars", rows: a.bars } : undefined,
  note: a.numbers?.length ? a.text : undefined,
  names: a.names,
});

// Histórico só desta sessão do navegador: nada vai ao servidor
const HISTORY_KEY = "mv-assistente-perguntas";
const readHistory = (): string[] => { try { return JSON.parse(sessionStorage.getItem(HISTORY_KEY) ?? "[]"); } catch { return []; } };
const saveHistory = (h: string[]) => { try { sessionStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(-30))); } catch { /* bloqueado */ } };
const store = () => { try { return localStorage; } catch { return null; } };

let seq = 0;

export default function AssistantPanel({ open, onClose, anchor }: { open: boolean; onClose: () => void; anchor: RefObject<HTMLButtonElement | null> }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [size, setSize] = useState<PanelSize>(() => readSize(store()));
  const [history, setHistory] = useState<string[]>(readHistory);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const scrollTo = useRef<number | null>(null);
  const { data: start } = useQuery({ queryKey: ["assistente-inicio"], queryFn: () => api<{ top: string | null; names: string[] }>("/analytics/assistente/inicio"), staleTime: 300_000, enabled: open });
  const wide = size === "ampliado";
  const asked = msgs.filter((m) => m.role === "user").map((m) => m.text);
  const askedSet = new Set(asked.map(fold));

  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => {
    const el = list.current;
    if (!el) return;
    // Resposta nova: rola até o início dela (resultado e gráfico à vista); pergunta nova: até o fim
    const target = scrollTo.current === null ? null : el.querySelector<HTMLElement>(`[data-msg="${scrollTo.current}"]`);
    if (target) el.scrollTo({ top: target.offsetTop - 8, behavior: "smooth" });
    else el.scrollTo({ top: el.scrollHeight });
    scrollTo.current = null;
  }, [msgs, busy]);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !anchor.current?.contains(t) && !(t as Element).closest?.("[data-sonner-toaster]")) onClose();
    };
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", down);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("pointerdown", down); };
  }, [open, onClose, anchor]);

  const resize = (s: PanelSize) => { setSize(s); writeSize(store(), s); };
  const reset = () => { setMsgs([]); setText(""); input.current?.focus(); };

  const ask = async (q: string) => {
    q = q.trim();
    if (!q || busy) return;
    setMsgs((m) => [...m, { id: ++seq, role: "user", text: q }]);
    setText("");
    setBusy(true);
    const h = [...history.filter((x) => fold(x) !== fold(q)), q];
    setHistory(h);
    saveHistory(h);
    try {
      const answer = await api<Answer>("/analytics/assistente", { body: { text: q, asked } });
      const id = ++seq;
      scrollTo.current = id;
      setMsgs((m) => [...m, { id, role: "bot", text: answer.text, answer }]);
    } catch (e) {
      setMsgs((m) => [...m, { id: ++seq, role: "bot", text: e instanceof Error ? e.message : "Não consegui responder agora. Tente de novo." }]);
    } finally {
      setBusy(false);
    }
  };
  const submit = (e: FormEvent) => { e.preventDefault(); ask(text); };

  const lastBot = [...msgs].reverse().find((m) => m.role === "bot");
  const typed = text.trim() ? autocomplete(text, start?.names ?? []) : [];
  const row = typed.length ? typed : (lastBot?.answer?.followups ?? []).filter((q) => !askedSet.has(fold(q)));

  return (
    <>
      <div aria-hidden className={cx("fixed inset-0 z-40 bg-black/45 transition-opacity", open ? "opacity-100" : "pointer-events-none opacity-0", !wide && "sm:hidden")} />
      <div ref={panel} role="dialog" aria-modal={wide} aria-label="Assistente de análises" hidden={!open} data-size={size}
        className="assistant-panel page-enter fixed z-50 flex flex-col overflow-hidden border border-line-strong bg-surface shadow-2xl">
        <header className="flex items-center gap-2 border-b border-line px-4 py-3">
          <span aria-hidden className="tile bg-accent-soft text-accent"><Sparkles /></span>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">Assistente</h2>
            <p className="truncate text-xs text-ink-3">Responde com os cálculos de Análises</p>
          </div>
          {!!msgs.length && (
            <button type="button" onClick={reset} className="flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-ink-2">
              <RotateCcw strokeWidth={1.6} className="size-4" /><span className={cx("sr-only", wide && "sm:not-sr-only")}>Nova conversa</span>
            </button>
          )}
          <button type="button" onClick={() => resize(wide ? "compacto" : "ampliado")} aria-pressed={wide} aria-label={wide ? "Reduzir o assistente" : "Expandir o assistente"}
            className="flex size-11 items-center justify-center rounded-full text-ink-2">
            {wide ? <Minimize2 strokeWidth={1.6} className="size-5" /> : <Maximize2 strokeWidth={1.6} className="size-5" />}
          </button>
          <button type="button" onClick={onClose} aria-label="Fechar assistente" className="flex size-11 items-center justify-center rounded-full text-ink-2"><X strokeWidth={1.6} className="size-5" /></button>
        </header>

        <div className={cx("grid min-h-0 flex-1 grid-cols-1", wide && "sm:grid-cols-[minmax(0,1fr)_260px]")}>
          <div className="flex min-h-0 flex-col">
            <div ref={list} aria-live="polite" className="relative flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 py-3">
              {!msgs.length && <Start top={start?.top ?? null} onAsk={ask} wide={wide} />}
              {msgs.map((m) => m.role === "user" ? (
                <p key={m.id} className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-accent-fill px-3 py-2 text-sm text-on-accent">{m.text}</p>
              ) : (
                <BotAnswer key={m.id} m={m} wide={wide} asked={askedSet} onAsk={ask} onExpand={() => resize("ampliado")} onClose={onClose} />
              ))}
              {busy && (
                <div role="status" aria-label="Calculando a resposta" className="flex max-w-[95%] flex-col gap-2 rounded-2xl rounded-bl-md bg-surface-2 p-3">
                  <Skeleton className="h-3.5 w-3/4" /><Skeleton className="h-3.5 w-1/2" /><Skeleton className="h-14 w-full" />
                </div>
              )}
            </div>

            {/* Sugestões sempre logo acima do campo: dá para seguir perguntando sem rolar */}
            {!!row.length && (
              <div aria-label={typed.length ? "Sugestões para o que você está digitando" : "Perguntas relacionadas"} className="flex gap-1.5 overflow-x-auto border-t border-line px-3 pt-2 [scrollbar-width:none]">
                {row.map((q) => (
                  <button key={q} type="button" onClick={() => (typed.length ? (setText(q), input.current?.focus()) : ask(q))}
                    className="min-h-9 shrink-0 rounded-full border border-[var(--btn-line-border)] px-3 text-xs font-medium whitespace-nowrap text-ink transition-transform active:scale-95">
                    {q}
                  </button>
                ))}
              </div>
            )}
            <form onSubmit={submit} className="flex items-center gap-2 p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
              <input ref={input} value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder="Ex.: qual a probabilidade de Helvira faltar?"
                aria-label="Pergunta ao assistente" autoComplete="off" className="field min-h-11 flex-1" />
              <button type="submit" disabled={busy || !text.trim()} aria-label="Enviar pergunta" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-fill text-on-accent disabled:opacity-50"><ArrowUp strokeWidth={2} className="size-5" /></button>
            </form>
            <p className="px-4 pb-3 text-[11px] text-ink-3">Estimativas estatísticas com dados fictícios de demonstração</p>
          </div>

          {wide && (
            <aside aria-label="Perguntas sugeridas e histórico" className="hidden min-h-0 flex-col gap-5 overflow-y-auto border-l border-line bg-surface-2/60 p-4 sm:flex">
              <section>
                <h3 className="mb-2 text-sm font-semibold">Perguntas sugeridas</h3>
                <Groups onAsk={ask} asked={askedSet} />
              </section>
              <section>
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><History strokeWidth={1.6} className="size-4" />Histórico da conversa</h3>
                {!history.length ? <p className="text-xs text-ink-3">As perguntas desta sessão aparecem aqui.</p> : (
                  <ul className="flex flex-col gap-1">
                    {[...history].reverse().map((h) => (
                      <li key={h}><button type="button" onClick={() => ask(h)} className="row-hover w-full rounded-lg px-2 py-1.5 text-left text-xs text-ink-2">{h}</button></li>
                    ))}
                  </ul>
                )}
              </section>
            </aside>
          )}
        </div>
      </div>
    </>
  );
}

function Groups({ onAsk, asked }: { onAsk: (q: string) => void; asked?: Set<string> }) {
  return (
    <div className="flex flex-col gap-3">
      {GROUPS.map((g) => (
        <div key={g.tema}>
          <p className="mb-1.5 text-xs font-semibold tracking-wide text-ink-3 uppercase">{g.tema}</p>
          <div className="flex flex-wrap gap-1.5">
            {g.perguntas.filter((q) => !asked?.has(fold(q))).map((q) => (
              <button key={q} type="button" onClick={() => onAsk(q)} className="min-h-9 rounded-full border border-[var(--btn-line-border)] px-3 text-left text-xs font-medium text-ink transition-transform active:scale-95">{q}</button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Start({ top, onAsk, wide }: { top: string | null; onAsk: (q: string) => void; wide: boolean }) {
  const example = top ? `Qual a probabilidade de ${top} faltar?` : null;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-2">Pergunte sobre faltas, receita e risco de pacientes.</p>
      {example && (
        <p className="text-sm">
          <span className="text-ink-3">Experimente: </span>
          <button type="button" onClick={() => onAsk(example)} className="text-left font-semibold text-accent underline-offset-2 hover:underline">{example}</button>
        </p>
      )}
      {/* Ampliado no desktop: os temas já estão na coluna da direita */}
      <div className={cx(wide && "sm:hidden")}><Groups onAsk={onAsk} /></div>
    </div>
  );
}

function BotAnswer({ m, wide, asked, onAsk, onExpand, onClose }: { m: Msg; wide: boolean; asked: Set<string>; onAsk: (q: string) => void; onExpand: () => void; onClose: () => void }) {
  const a = m.answer;
  const rich = !!(a?.numbers?.length || a?.bars?.length);
  const follow = (a?.followups ?? []).filter((q) => !asked.has(fold(q)));
  return (
    <div data-msg={m.id} className="relative max-w-[97%] scroll-mt-2 rounded-2xl rounded-bl-md bg-surface-2 p-3 text-sm">
      {a?.export && <ExportButton spec={() => specOf(a)} className="relative float-right -mt-1 -mr-1 ml-2" />}
      <p className={cx("whitespace-pre-line", !wide && rich && "line-clamp-4")}>{m.text}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-4">
        {!wide && rich && (
          <button type="button" onClick={onExpand} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-accent">
            <Maximize2 strokeWidth={1.8} className="size-3.5" />Expandir para ver mais
          </button>
        )}
        {a?.link && (
          <Link href={a.link.href} onClick={onClose} className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent">
            <ExternalLink strokeWidth={1.6} className="size-4" />{a.link.label}
          </Link>
        )}
      </div>
      {wide && !!a?.numbers?.length && (
        <dl className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {a.numbers.map((n) => <div key={n.label} className="rounded-xl bg-surface p-2.5"><dt className="text-xs text-ink-3">{n.label}</dt><dd className="mt-0.5 font-display text-xl leading-tight tabular-nums">{n.value}</dd></div>)}
        </dl>
      )}
      {wide && !!a?.bars?.length && <div className="mt-3 rounded-xl bg-surface p-3"><HBars label="Detalhe da resposta" rows={a.bars} /></div>}
      {a?.choices && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {a.choices.map((c) => <button key={c.label} type="button" onClick={() => onAsk(c.text)} className="min-h-9 rounded-full border border-[var(--btn-line-border)] px-3 text-xs font-medium">{c.label}</button>)}
        </div>
      )}
      {!!follow.length && (
        <div className="mt-2 border-t border-line pt-2">
          <p className="mb-1.5 text-xs font-semibold text-ink-3">Quer saber mais?</p>
          <div className="flex flex-wrap gap-1.5">
            {follow.map((q) => <button key={q} type="button" onClick={() => onAsk(q)} className="min-h-9 rounded-full bg-accent-soft px-3 text-left text-xs font-medium text-ink transition-transform active:scale-95">{q}</button>)}
          </div>
        </div>
      )}
    </div>
  );
}
