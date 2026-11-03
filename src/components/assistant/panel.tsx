"use client";

import { ArrowUp, ExternalLink, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { api } from "@/lib/api";
import { SHORTCUTS } from "@/lib/assistente";
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

let seq = 0;

export default function AssistantPanel({ open, onClose, anchor }: { open: boolean; onClose: () => void; anchor: RefObject<HTMLButtonElement | null> }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [msgs, busy]);
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

  const ask = async (q: string) => {
    if (!q.trim() || busy) return;
    // "Risco do paciente [nome]" só preenche: falta o nome
    if (q.endsWith(" ")) { setText(q); input.current?.focus(); return; }
    setMsgs((m) => [...m, { id: ++seq, role: "user", text: q }]);
    setText("");
    setBusy(true);
    try {
      const answer = await api<Answer>("/analytics/assistente", { body: { text: q } });
      setMsgs((m) => [...m, { id: ++seq, role: "bot", text: answer.text, answer }]);
    } catch (e) {
      setMsgs((m) => [...m, { id: ++seq, role: "bot", text: e instanceof Error ? e.message : "Não consegui responder agora. Tente de novo." }]);
    } finally {
      setBusy(false);
    }
  };
  const submit = (e: FormEvent) => { e.preventDefault(); ask(text); };

  return (
    <>
      {/* No celular, o fundo escurece e fecha ao tocar fora; no desktop é um popover ancorado */}
      <div aria-hidden className={cx("fixed inset-0 z-40 bg-black/40 transition-opacity sm:hidden", open ? "opacity-100" : "pointer-events-none opacity-0")} />
      <div ref={panel} role="dialog" aria-modal="false" aria-label="Assistente de análises" hidden={!open}
        className="assistant-panel pop-in fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-[20px] border border-line-strong bg-surface shadow-2xl sm:inset-x-auto sm:right-6 sm:w-[420px] sm:rounded-[20px]">
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h2 className="font-semibold">Assistente</h2>
            <p className="text-xs text-ink-3">Responde com os cálculos de Análises</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar assistente" className="flex size-11 items-center justify-center rounded-full text-ink-2"><X strokeWidth={1.6} className="size-5" /></button>
        </header>

        <div ref={list} aria-live="polite" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 py-3">
          {!msgs.length && <p className="text-sm text-ink-2">Pergunte sobre faltas, receita e risco de pacientes. Alguns atalhos:</p>}
          {!msgs.length && <Chips items={SHORTCUTS} onPick={ask} />}
          {msgs.map((m) => m.role === "user" ? (
            <p key={m.id} className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-accent-fill px-3 py-2 text-sm text-on-accent">{m.text}</p>
          ) : (
            <div key={m.id} className="relative max-w-[95%] rounded-2xl rounded-bl-md bg-surface-2 p-3 text-sm">
              {m.answer?.export && <ExportButton spec={() => specOf(m.answer!)} className="relative float-right -mt-1 -mr-1 ml-2" />}
              <p className="whitespace-pre-line">{m.text}</p>
              {!!m.answer?.numbers?.length && (
                <dl className="mt-2 grid grid-cols-2 gap-2">
                  {m.answer.numbers.map((n) => <div key={n.label} className="rounded-xl bg-surface p-2"><dt className="text-xs text-ink-3">{n.label}</dt><dd className="font-semibold tabular-nums">{n.value}</dd></div>)}
                </dl>
              )}
              {!!m.answer?.bars?.length && <div className="mt-3"><HBars label="Detalhe da resposta" rows={m.answer.bars} /></div>}
              {m.answer?.choices && <div className="mt-2"><Chips items={m.answer.choices} onPick={ask} /></div>}
              {m.answer?.link && (
                <Link href={m.answer.link.href} onClick={onClose} className="mt-2 inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent">
                  <ExternalLink strokeWidth={1.6} className="size-4" />{m.answer.link.label}
                </Link>
              )}
            </div>
          ))}
          {busy && <div role="status" aria-label="Calculando" className="flex flex-col gap-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-16 w-full" /></div>}
        </div>

        <form onSubmit={submit} className="flex items-center gap-2 border-t border-line p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          <input ref={input} value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder="Ex.: quanto vou perder este mês?" aria-label="Pergunta ao assistente" className="field min-h-11 flex-1" />
          <button type="submit" disabled={busy || !text.trim()} aria-label="Enviar pergunta" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-fill text-on-accent disabled:opacity-50"><ArrowUp strokeWidth={2} className="size-5" /></button>
        </form>
        <p className="px-4 pb-3 text-[11px] text-ink-3">Estimativas estatísticas com dados fictícios de demonstração</p>
      </div>
    </>
  );
}

function Chips({ items, onPick }: { items: { label: string; text: string }[]; onPick: (t: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((c) => (
        <button key={c.label} type="button" onClick={() => onPick(c.text)} className="min-h-9 rounded-full border border-[var(--btn-line-border)] px-3 text-left text-xs font-medium text-ink transition-transform active:scale-95">{c.label}</button>
      ))}
    </div>
  );
}
