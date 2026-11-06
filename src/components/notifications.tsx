"use client";

import { useQuery } from "@tanstack/react-query";
import { Bell, BellOff, CalendarCheck, CalendarClock, Heart, QrCode, Repeat, ShieldCheck, Sparkles, X, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { api } from "@/lib/api";
import { fmtRelative } from "@/lib/time";
import { Sheet } from "./lazy-sheet";
import { leave, usePresence } from "@/lib/motion";
import { useAction } from "./providers";
import { Button, cx } from "./ui";

type Note = { id: string; type: string; title: string; body: string; href: string | null; readAt: string | null; createdAt: string };
type Notes = { unread: number; items: Note[] };

const KEY = ["notifications"];
const useNotes = () => useQuery({ queryKey: KEY, queryFn: () => api<Notes>("/notifications"), refetchInterval: 30_000 });

const ICONS: Record<string, LucideIcon> = {
  PROGRESSO: Heart, LEMBRETE: CalendarClock, TROCA: Repeat, RENOVACAO: ShieldCheck, VAGA: Sparkles, TRATAMENTO: CalendarCheck, PAGAMENTO: QrCode,
};

export function BellButton({ onOpen, buttonRef }: { onOpen: () => void; buttonRef?: RefObject<HTMLButtonElement | null> }) {
  const { data } = useNotes();
  return (
    <button ref={buttonRef} type="button" onClick={onOpen} aria-haspopup="dialog" aria-label={`Notificações${data?.unread ? `, ${data.unread} não lidas` : ""}`}
      className="relative flex size-11 items-center justify-center rounded-full text-ink-2">
      <Bell strokeWidth={1.5} className="size-5" />
      {!!data?.unread && (
        <span className="absolute top-1 right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent-fill px-1 text-[11px] font-bold text-on-accent">
          {data.unread > 9 ? "9+" : data.unread}
        </span>
      )}
    </button>
  );
}

function NoteList({ onPick, onDismiss }: { onPick: (n: Note) => void; onDismiss: (n: Note) => void }) {
  const { data } = useNotes();
  if (!data?.items.length)
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-accent-soft text-accent"><BellOff strokeWidth={1.5} className="size-6" /></span>
        <p className="font-display text-2xl">Tudo em dia por aqui</p>
        <p className="text-sm text-ink-2">Avisos sobre suas sessões aparecem aqui.</p>
      </div>
    );
  return (
    <ul className="stagger flex flex-col">
      {data.items.map((n) => {
        const Icon = ICONS[n.type] ?? Bell;
        return (
          <li key={n.id} className="flex items-start border-b border-line last:border-0">
            <button type="button" onClick={() => onPick(n)} className="row-hover flex min-w-0 flex-1 gap-3 py-3.5 pl-1 text-left">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"><Icon strokeWidth={1.5} className="size-[18px]" /></span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={cx("min-w-0", n.readAt ? "font-medium" : "font-semibold")}>{n.title}</span>
                  <span className="shrink-0 text-xs text-ink-3">{fmtRelative(n.createdAt)}</span>
                </span>
                <span className="mt-0.5 block text-sm text-ink-2">{n.body}</span>
              </span>
              {!n.readAt && <span role="img" aria-label="Não lida" className="mt-2 size-2 shrink-0 rounded-full bg-accent" />}
            </button>
            {/* Ícone pequeno, alvo de 44px: distinto do X de fechar o painel, que fica no cabeçalho */}
            <button type="button" onClick={(e) => leave(e.currentTarget, () => onDismiss(n))} aria-label="Apagar notificação" title="Apagar notificação"
              className="mt-1.5 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-ink-3 hover:text-ink">
              <X strokeWidth={1.75} className="size-3.5" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function NoteActions() {
  const { data } = useNotes();
  const readAll = useAction({
    run: () => api("/notifications/read", { body: {} }),
    optimistic: { key: KEY, update: (old: Notes) => ({ unread: 0, items: old.items.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) }) },
  });
  const clearAll = useAction({
    run: () => api("/notifications/dismiss", { body: {} }),
    optimistic: { key: KEY, update: () => ({ unread: 0, items: [] }) },
  });
  if (!data?.items.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {!!data.unread && <Button variant="ghost" className="flex-1" onClick={() => readAll.mutate()}>Marcar todas como lidas</Button>}
      <Button variant="ghost" className="flex-1" onClick={() => clearAll.mutate()}>Limpar todas</Button>
    </div>
  );
}

function Popover({ onClose, anchor, closing, children }: { onClose: () => void; anchor: DOMRect; closing: boolean; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      onClose();
      opener?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50">
      <div className={cx("absolute inset-0 bg-scrim/15", closing ? "fade-out" : "fade-in")} onClick={onClose} aria-hidden />
      <div ref={panel} role="dialog" aria-modal="true" aria-label="Notificações" tabIndex={-1}
        style={{ left: anchor.right + 12, bottom: Math.max(16, window.innerHeight - anchor.bottom) }}
        className={cx(closing ? "panel-out" : "panel-in", "absolute flex max-h-[min(640px,calc(100dvh-32px))] w-[420px] flex-col rounded-2xl border border-line-strong bg-surface shadow-2xl outline-none")}>
        <header className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="font-display text-2xl">Notificações</h2>
          <button type="button" onClick={onClose} aria-label="Fechar notificações" className="-mr-2 flex size-11 items-center justify-center rounded-full text-ink-2"><X strokeWidth={1.5} className="size-5" /></button>
        </header>
        {children}
      </div>
    </div>
  );
}

/** Popover opaco ancorado ao sino no desktop; bottom sheet opaco no mobile. */
export function NotificationPanel({ open, anchor, onClose }: { open: boolean; anchor: DOMRect | null; onClose: () => void }) {
  const router = useRouter();
  // Desktop: o popover fica montado durante a saída (150 ms); no celular o Sheet cuida disso
  const { present, closing } = usePresence(open && !!anchor);
  const pick = useAction({
    run: (n: Note) => api("/notifications/read", { body: { id: n.id } }),
    optimistic: {
      key: KEY,
      update: (old: Notes, n: Note) => ({
        unread: n.readAt ? old.unread : Math.max(0, old.unread - 1),
        items: old.items.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)),
      }),
    },
  });
  const dismiss = useAction({
    run: (n: Note) => api("/notifications/dismiss", { body: { id: n.id } }),
    optimistic: {
      key: KEY,
      update: (old: Notes, n: Note) => ({ unread: n.readAt ? old.unread : Math.max(0, old.unread - 1), items: old.items.filter((x) => x.id !== n.id) }),
    },
  });
  const onPick = (n: Note) => {
    pick.mutate(n);
    onClose();
    if (n.href) router.push(n.href);
  };
  const body = <NoteList onPick={onPick} onDismiss={(n) => dismiss.mutate(n)} />;
  // anchor só existe quando o sino clicado é o da sidebar
  if (anchor) {
    if (!present) return null;
    return (
      <Popover onClose={onClose} anchor={anchor} closing={closing}>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4">{body}</div>
        <div className="p-4 empty:hidden"><NoteActions /></div>
      </Popover>
    );
  }
  return (
    <Sheet open={open} onClose={onClose} title="Notificações">
      {body}
      <div className="mt-3 empty:hidden"><NoteActions /></div>
    </Sheet>
  );
}
