"use client";

import { BadgeCheck, Info } from "lucide-react";
import type { ReactNode } from "react";
import type { ExportBody } from "@/lib/exportar";
import { Tile, cx } from "../ui";
import type { Tone } from "@/lib/labels";

export type Filters = { unitId: string; unidade: string; dias: number; periodo: string };

export const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
export const pct = (n: number, digits = 0) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: digits })}%`;
export const num = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
export const SERIES = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

export function CardTitle({ icon, tone, children, hint }: { icon?: ReactNode; tone?: Tone; children: ReactNode; hint?: string }) {
  return (
    <div className="mb-4 pr-12">
      <h2 className="flex items-center gap-3 font-semibold">{icon && <Tile tone={tone}>{icon}</Tile>}{children}</h2>
      {hint && <p className="mt-1 text-sm text-ink-3">{hint}</p>}
    </div>
  );
}

/** Cartão de número: rótulo, valor, faixa ou dica. */
export function Figure({ label, value, hint, tone = "accent", icon }: { label: string; value: string; hint?: string; tone?: Tone; icon: ReactNode }) {
  return (
    <>
      <Tile tone={tone} className="mb-3">{icon}</Tile>
      <p className="pr-10 text-sm text-ink-2">{label}</p>
      <p className="mt-1 font-display text-[32px] leading-none tabular-nums">{value}</p>
      {hint && <p className="mt-2 text-sm text-ink-3">{hint}</p>}
    </>
  );
}

/** Barras horizontais com rótulo e valor escrito: a cor só separa, o número é sempre legível. */
export function HBars({ rows, label }: { rows: { label: string; value: number; display: string }[]; label: string }) {
  const max = Math.max(1e-9, ...rows.map((r) => r.value));
  return (
    <ul aria-label={label} className="flex flex-col gap-3">
      {rows.map((r, i) => (
        <li key={r.label}>
          <div className="mb-1 flex justify-between gap-3 text-sm"><span className="truncate text-ink-2">{r.label}</span><span className="font-semibold tabular-nums">{r.display}</span></div>
          <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
            <div className="bar-h h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: SERIES[i % SERIES.length] }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

const W = 640, H = 220, P = { l: 48, r: 12, t: 12, b: 24 };

/** Receita acumulada por dia: realizada (linha cheia), prevista (tracejada) e faixa de 80%. */
export function RevenueChart({ points }: { points: { day: number; realized: number | null; expected: number | null; lo: number | null; hi: number | null }[] }) {
  const max = Math.max(1, ...points.flatMap((p) => [p.realized ?? 0, p.hi ?? 0, p.expected ?? 0]));
  const x = (d: number) => P.l + ((d - 1) / Math.max(1, points.length - 1)) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - v / max) * (H - P.t - P.b);
  const line = (key: "realized" | "expected") => points.filter((p) => p[key] !== null).map((p, i) => `${i ? "L" : "M"}${x(p.day).toFixed(1)} ${y(p[key]!).toFixed(1)}`).join(" ");
  const band = points.filter((p) => p.lo !== null && p.hi !== null);
  const area = band.length > 1 ? `${band.map((p, i) => `${i ? "L" : "M"}${x(p.day).toFixed(1)} ${y(p.hi!).toFixed(1)}`).join(" ")} ${[...band].reverse().map((p) => `L${x(p.day).toFixed(1)} ${y(p.lo!).toFixed(1)}`).join(" ")} Z` : "";
  const last = points.at(-1);
  return (
    <figure>
      <ul className="mb-2 flex flex-wrap gap-4 text-sm text-ink-2">
        <li className="flex items-center gap-1.5"><span aria-hidden className="h-0.5 w-5 bg-[var(--chart-1)]" />Realizada</li>
        <li className="flex items-center gap-1.5"><span aria-hidden className="h-0.5 w-5 border-t-2 border-dashed border-[var(--chart-2)]" />Prevista</li>
        <li className="flex items-center gap-1.5"><span aria-hidden className="size-3 rounded-sm bg-accent-soft" />Faixa de 80%</li>
      </ul>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
        aria-label={`Receita acumulada no mês: ${last?.expected !== null && last?.expected !== undefined ? `prevista ${brl(last.expected)}` : `realizada ${brl(last?.realized ?? 0)}`}`}>
        {[0, 0.5, 1].map((g) => (
          <g key={g}>
            <line x1={P.l} x2={W - P.r} y1={y(max * g)} y2={y(max * g)} stroke="var(--line)" />
            <text x={P.l - 6} y={y(max * g) + 4} textAnchor="end" fontSize="11" fill="var(--ink-3)">{max * g >= 1000 ? `${Math.round((max * g) / 1000)} mil` : Math.round(max * g)}</text>
          </g>
        ))}
        {area && <path d={area} fill="var(--accent-soft)" />}
        <path d={line("realized")} fill="none" stroke="var(--chart-1)" strokeWidth="2.5" strokeLinejoin="round" />
        <path d={line("expected")} fill="none" stroke="var(--chart-2)" strokeWidth="2.5" strokeDasharray="6 5" strokeLinejoin="round" />
        {points.filter((p) => p.day === 1 || p.day % 5 === 0).map((p) => <text key={p.day} x={x(p.day)} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--ink-3)">{p.day}</text>)}
      </svg>
    </figure>
  );
}

export function Seal({ months, sessions }: { months: number; sessions: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-ok-soft px-3 py-1 text-xs font-semibold text-ok">
      <BadgeCheck className="size-3.5" />Base: {months} meses · {sessions.toLocaleString("pt-BR")} sessões
    </span>
  );
}

export function Disclaimer({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <p className={cx("flex items-start gap-2 rounded-2xl bg-info-soft p-3 text-sm text-info", className)}>
      <Info className="mt-0.5 size-4 shrink-0" />
      <span>{children ?? "Previsão estatística com dados fictícios de demonstração. Não é garantia de resultado."}</span>
    </p>
  );
}

export const barsBody = (rows: { label: string; value: number; display: string }[]): ExportBody => ({ kind: "bars", rows });
