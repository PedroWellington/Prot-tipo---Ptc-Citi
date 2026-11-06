"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ComponentProps, type CSSProperties, type ReactNode } from "react";
import { AlertCircle, Info, Search, WifiOff, X } from "lucide-react";
import type { Tone } from "@/lib/labels";
import { ApiError } from "@/lib/api";
import { MarcaMovimento } from "./marca";
import { CountUp, PillIndicator } from "./motion";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "brand" | "ghost" | "line" | "danger";

export function Button({ variant = "primary", className, loading, children, ...p }: ComponentProps<"button"> & { variant?: Variant; loading?: boolean }) {
  return (
    <button type="button" {...p} disabled={p.disabled || loading} aria-busy={loading || undefined} className={cx("btn", `btn-${variant}`, className)}>
      {/* Carregando: o rótulo fica (invisível) e segura a largura; o indicador entra por cima, sem mudar o tamanho */}
      {loading ? <><span className="inline-flex items-center gap-2 opacity-0">{children}</span><span aria-hidden className="btn-spinner" /></> : children}
    </button>
  );
}

export function LinkButton({ variant = "primary", className, ...p }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link {...p} className={cx("btn", `btn-${variant}`, className)} />;
}

export function Card({ className, ...p }: ComponentProps<"section">) {
  return <section {...p} className={cx("card p-5 sm:p-6", className)} />;
}

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2",
  accent: "bg-accent-soft text-accent",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
};

/** Ícone em quadrado arredondado com fundo tonal. */
export function Tile({ tone = "accent", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span aria-hidden className={cx("tile", TONES[tone], className)}>{children}</span>;
}

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap", TONES[tone], className)}>{children}</span>;
}

export function Field({ label, error, hint, note, hideLabel, children }: { label: string; error?: string; hint?: string; note?: ReactNode; hideLabel?: boolean; children: (id: string, describedBy?: string) => ReactNode }) {
  const id = useId();
  const msg = error ?? hint;
  // O aviso fica sempre visível e ligado ao campo; a mensagem de erro entra junto, sem substituí-lo
  const described = [note && `${id}-n`, msg && `${id}-m`].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={hideLabel ? "sr-only" : "text-sm font-medium text-ink-2"}>{label}</label>
      {children(id, described)}
      {note && <Notice id={`${id}-n`}>{note}</Notice>}
      {msg && <p id={`${id}-m`} className={cx("text-sm", error ? "text-danger" : "text-ink-3")}>{msg}</p>}
    </div>
  );
}

/** Aviso discreto com ícone e fundo sólido (sem transparência) nos dois temas. */
export function Notice({ id, children, className }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <p id={id} className={cx("notice flex items-start gap-2 rounded-xl px-3 py-2 text-[13px] leading-snug", className)}>
      <Info strokeWidth={2} aria-hidden className="mt-px size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export function Input({ label, error, hint, note, ...p }: ComponentProps<"input"> & { label: string; error?: string; hint?: string; note?: ReactNode }) {
  return (
    <Field label={label} error={error} hint={hint} note={note}>
      {(id, d) => <input {...p} id={id} aria-describedby={d} aria-invalid={!!error} className={p.className ?? "field"} />}
    </Field>
  );
}

export function Textarea({ label, ...p }: ComponentProps<"textarea"> & { label: string }) {
  return <Field label={label}>{(id) => <textarea rows={3} {...p} id={id} className="field" />}</Field>;
}

export function Select({ label, error, hideLabel, children, ...p }: ComponentProps<"select"> & { label: string; error?: string; hideLabel?: boolean }) {
  return (
    <Field label={label} error={error} hideLabel={hideLabel}>
      {(id, d) => <select {...p} id={id} aria-describedby={d} aria-invalid={!!error} className="field">{children}</select>}
    </Field>
  );
}

/** Busca única do sistema: emite com debounce curto, sem recalcular a cada tecla. */
export function SearchField({ onSearch, placeholder = "Buscar por nome", delay = 180 }: { onSearch: (v: string) => void; placeholder?: string; delay?: number }) {
  const [value, setValue] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const change = (v: string) => {
    setValue(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onSearch(v.trim()), v ? delay : 0);
  };
  return (
    <div className="relative">
      <Search strokeWidth={1.5} aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-ink-3" />
      <input type="search" value={value} onChange={(e) => change(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="field search-input [&::-webkit-search-cancel-button]:hidden" />
      {value && (
        <button type="button" aria-label="Limpar busca" onClick={() => change("")} className="absolute top-1/2 right-1 flex size-10 -translate-y-1/2 items-center justify-center rounded-full text-ink-3">
          <X strokeWidth={1.5} className="size-4" />
        </button>
      )}
    </div>
  );
}

export function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
      <span>
        <span className="block text-[15px]">{label}</span>
        {hint && <span className="block text-sm text-ink-3">{hint}</span>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span aria-hidden className={cx("relative h-7 w-12 shrink-0 rounded-full transition-opacity peer-focus-visible:outline-2 peer-focus-visible:outline-accent", checked ? "bg-accent-fill" : "bg-surface-2 ring-1 ring-line-strong")}>
        <span className={cx("toggle-knob absolute top-0.5 left-0.5 size-6 rounded-full", checked ? "translate-x-5 bg-on-accent" : "bg-ink-3")} />
      </span>
    </label>
  );
}

/** Filtro em pílula (radiogroup): um destaque só desliza até a opção escolhida. */
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="pills flex gap-1 rounded-full bg-surface-2 p-1">
      <PillIndicator index={options.findIndex((o) => o.value === value)} />
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cx("min-h-10 flex-1 rounded-full px-3 text-sm font-semibold whitespace-nowrap", value === o.value ? "text-on-accent" : "text-ink-2")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Abas em pílula (tablist), com o mesmo destaque deslizante do Segmented. */
export function SlidingTabs<T extends string>({ value, onChange, tabs, label }: { value: T; onChange: (v: T) => void; tabs: readonly { id: T; label: string }[]; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="pills flex gap-1 rounded-full bg-surface-2 p-1">
      <PillIndicator index={tabs.findIndex((t) => t.id === value)} />
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={cx("min-h-11 flex-1 rounded-full px-3 text-sm font-semibold whitespace-nowrap", value === t.id ? "text-on-accent" : "text-ink-2")}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export const Skeleton = ({ className }: { className?: string }) => <div aria-hidden className={cx("skeleton", className)} />;

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label="Carregando">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}
    </div>
  );
}

export function Empty({ title, body, action, art }: { title: string; body?: string; action?: ReactNode; art?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      {art ?? <EmptyArt />}
      <h3 className="font-display text-2xl">{title}</h3>
      {body && <p className="max-w-sm text-ink-2">{body}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const offline = error instanceof ApiError && error.code === "OFFLINE";
  const Icon = offline ? WifiOff : AlertCircle;
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <Icon strokeWidth={1.5} className="size-8 text-ink-3" />
      <h3 className="font-display text-2xl">{offline ? "Você está offline" : "Não foi possível carregar"}</h3>
      <p className="max-w-sm text-ink-2">{error instanceof Error ? error.message : "Tente novamente em instantes."}</p>
      {retry && <Button variant="ghost" onClick={retry}>Tentar de novo</Button>}
    </div>
  );
}

export function PageTitle({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <header className="reveal mb-6 flex items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="mb-1 text-sm text-ink-3">{eyebrow}</p>}
        <h1 className="font-display text-[34px] leading-tight sm:text-[40px]">{title}</h1>
      </div>
      {action}
    </header>
  );
}

/** O "M" da marca (MarcaMovimento, variante padrão). */
export function LogoMark({ className, style }: { className?: string; style?: CSSProperties }) {
  return <MarcaMovimento className={className} style={style} />;
}

/** Wordmark único: o M é o logo e a palavra continua em "ovimento". */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <span role="img" aria-label="Movimento" className="inline-flex items-center text-ink">
      <LogoMark style={{ height: size * 1.3, width: size * 1.3, marginRight: size * -0.08 }} />
      <span aria-hidden className="font-display leading-none" style={{ fontSize: size }}>ovimento</span>
    </span>
  );
}

function EmptyArt() {
  return (
    <svg viewBox="0 0 96 64" className="h-16 w-24 text-accent" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
      {/* O traço se desenha uma vez ao aparecer; os pontos entram depois */}
      <path d="M4 52c14 0 14-30 28-30s14 22 28 22 14-30 32-34" opacity=".9" pathLength={1} className="draw" />
      <circle cx="32" cy="22" r="3" fill="var(--bg)" className="fade-late" />
      <circle cx="60" cy="44" r="3" fill="var(--bg)" className="fade-late" />
    </svg>
  );
}

export function SuccessCheck() {
  return (
    <span className="pop-in inline-flex size-16 items-center justify-center rounded-full bg-accent-soft text-accent">
      <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="m5 13 4 4L19 7" />
      </svg>
    </span>
  );
}

export function Stat({ label, value, hint, icon, tone }: { label: string; value: ReactNode; hint?: string; icon?: ReactNode; tone?: Tone }) {
  return (
    <div data-tone={tone} className={cx("card lift p-4 sm:p-5", !!icon && "stripe")}>
      {icon && <Tile tone={tone} className="mb-3">{icon}</Tile>}
      <p className="text-sm text-ink-2">{label}</p>
      <p className="mt-1 font-display text-[34px] leading-none tabular-nums">{typeof value === "number" || typeof value === "string" ? <CountUp value={value} /> : value}</p>
      {hint && <p className="mt-2 text-sm text-ink-3">{hint}</p>}
    </div>
  );
}
