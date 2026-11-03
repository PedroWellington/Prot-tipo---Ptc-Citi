"use client";

import { cx } from "./ui";

export type Series = { key: string; label: string; color: string };
type Row = Record<string, number | string> & { key: string };

const fmt = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-4 text-sm text-ink-2">
      {series.map((s) => <li key={s.key} className="flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</li>)}
    </ul>
  );
}

function DataTable({ rows, series, head }: { rows: Row[]; series: Series[]; head: string }) {
  return (
    <details className="mt-3 text-sm text-ink-2">
      <summary className="min-h-11 cursor-pointer py-2">Ver como tabela</summary>
      <table className="w-full text-left tabular-nums">
        <thead><tr><th className="py-1 font-medium">{head}</th>{series.map((s) => <th key={s.key} className="py-1 font-medium">{s.label}</th>)}</tr></thead>
        <tbody>{rows.map((r) => <tr key={r.key} className="border-t border-line"><td className="py-1">{r.key}</td>{series.map((s) => <td key={s.key} className="py-1">{fmt(Number(r[s.key]))}</td>)}</tr>)}</tbody>
      </table>
    </details>
  );
}

/** Barras verticais agrupadas com escala comum; `highlight` destaca uma categoria. */
export function Columns({ rows, series, head, highlight, note }: { rows: Row[]; series: Series[]; head: string; highlight?: string; note?: string }) {
  const max = Math.max(10, ...rows.flatMap((r) => series.map((s) => Number(r[s.key]))));
  const top = Math.ceil(max / 10) * 10;
  return (
    <figure>
      <Legend series={series} />
      <div className="relative mt-4 h-52 pl-8">
        {[0, 0.5, 1].map((f) => (
          <div key={f} className="absolute inset-x-0 flex items-center gap-2" style={{ bottom: `${f * 100}%` }}>
            <span className="w-6 translate-y-1/2 text-right text-xs text-ink-3 tabular-nums">{Math.round(top * f)}</span>
            <span className="h-px flex-1 translate-y-1/2 bg-line" />
          </div>
        ))}
        <div className="relative flex h-full items-end gap-1 sm:gap-2">
          {rows.map((r) => (
            <div key={r.key} tabIndex={0} aria-label={`${head} ${r.key}: ${series.map((s) => `${s.label} ${fmt(Number(r[s.key]))}`).join(", ")}`}
              className={cx("group relative flex h-full flex-1 items-end justify-center gap-0.5 rounded-t-md outline-none focus-visible:bg-accent-soft", r.key === highlight && "bg-accent-soft")}>
              {series.map((s) => (
                <div key={s.key} className="bar w-full max-w-5 rounded-t" style={{ height: `${(Number(r[s.key]) / top) * 100}%`, background: s.color }} />
              ))}
              <div role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 rounded-lg border border-line-strong bg-surface-2 px-2.5 py-1.5 text-xs whitespace-nowrap opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus:opacity-100">
                <b className="font-semibold">{head} {r.key}</b>
                {series.map((s) => <span key={s.key} className="block text-ink-2">{s.label}: {fmt(Number(r[s.key]))}</span>)}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1 flex gap-1 pl-8 sm:gap-2">
        {rows.map((r) => <span key={r.key} className={cx("flex-1 text-center text-xs tabular-nums", r.key === highlight ? "font-semibold text-ink" : "text-ink-3")}>{r.key}</span>)}
      </div>
      {note && <figcaption className="mt-2 text-sm text-ink-2">{note}</figcaption>}
      <DataTable rows={rows} series={series} head={head} />
    </figure>
  );
}

/** Barras horizontais com rótulo direto, para poucas categorias. */
export function Bars({ rows, label }: { rows: { key: string; rate: number }[]; label: string }) {
  const max = Math.max(1, ...rows.map((r) => r.rate));
  return (
    <ul aria-label={label} className="flex flex-col gap-3">
      {rows.map((r, i) => (
        <li key={r.key}>
          <div className="mb-1 flex justify-between text-sm"><span className="text-ink-2">{r.key}</span><span className="font-semibold tabular-nums">{fmt(r.rate)}</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="bar-h h-full rounded-full" style={{ width: `${(r.rate / max) * 100}%`, background: `var(--bar-${(i % 5) + 1})` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

const DAY_PARTS = [
  { key: "REALIZADA", label: "Realizadas", color: "var(--ok)" },
  { key: "CONFIRMADA", label: "Confirmadas", color: "var(--info)" },
  { key: "AGENDADA", label: "A confirmar", color: "var(--warn)" },
  { key: "FALTA", label: "Faltas", color: "var(--danger)" },
] as const;

/** Resumo do dia por unidade (barra empilhada por status) e ocupação por hora (mini colunas). */
export function DaySummary({ sessions }: { sessions: { status: string; startsAt: Date | string; unit: { name: string } }[] }) {
  const live = sessions.filter((s) => s.status !== "REAGENDADA" && s.status !== "DESMARCADA");
  const units = [...new Set(live.map((s) => s.unit.name))].sort();
  const byHour = new Map<number, number>();
  for (const s of live) {
    const h = Number(new Date(s.startsAt).toLocaleString("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "America/Recife" }));
    byHour.set(h, (byHour.get(h) ?? 0) + 1);
  }
  const hours = Array.from({ length: 14 }, (_, i) => i + 7);
  const peak = Math.max(1, ...byHour.values());
  return (
    <div className="flex flex-col gap-5">
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-2">
        {DAY_PARTS.map((p) => <li key={p.key} className="flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-sm" style={{ background: p.color }} />{p.label}</li>)}
      </ul>
      {!units.length && <p className="text-sm text-ink-3">Sem sessões neste dia.</p>}
      {units.map((u) => {
        const mine = live.filter((s) => s.unit.name === u);
        const parts = DAY_PARTS.map((p) => ({ ...p, n: mine.filter((s) => s.status === p.key).length }));
        return (
          <div key={u}>
            <div className="mb-1.5 flex justify-between text-sm"><span className="font-medium">{u}</span><span className="text-ink-3 tabular-nums">{mine.length} sessões</span></div>
            <div role="img" aria-label={`${u}: ${parts.map((p) => `${p.n} ${p.label.toLowerCase()}`).join(", ")}`} className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-surface-2">
              {parts.filter((p) => p.n).map((p) => <span key={p.key} className="bar-h h-full" style={{ flexGrow: p.n, background: p.color }} />)}
            </div>
          </div>
        );
      })}
      <div>
        <p className="mb-2 text-sm font-medium">Sessões por hora</p>
        <div role="img" aria-label={`Pico de ${peak} sessões por hora`} className="flex h-16 items-end gap-1">
          {hours.map((h) => (
            <span key={h} className="flex h-full flex-1 flex-col justify-end">
              <span className="bar rounded-t-sm" style={{ height: `${((byHour.get(h) ?? 0) / peak) * 100}%`, background: "var(--chart-1)", opacity: byHour.get(h) ? 1 : 0 }} />
            </span>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-xs text-ink-3 tabular-nums"><span>7h</span><span>13h</span><span>20h</span></div>
      </div>
    </div>
  );
}
