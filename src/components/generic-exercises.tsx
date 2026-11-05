"use client";

import { ChevronDown, Dumbbell, ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { api } from "@/lib/api";
import { q } from "@/lib/queries";
import type { Home } from "./patient-home";
import { useAction } from "./providers";
import { Badge, cx, Tile } from "./ui";

type Full = Extract<Home, { sessions: unknown }>;
export type GenericExercise = Full["generic"][number];

export const FIXED_PHRASE = "Logo mais, o seu fisioterapeuta passará exercícios mais específicos para o seu caso.";

// Ilustrações em traço, sem foto de pessoa: chão, figura e a direção do movimento
const svg = (body: ReactNode) => (
  <svg viewBox="0 0 64 64" className="size-12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{body}</svg>
);
const ART: Record<string, ReactNode> = {
  pescoco: svg(<><circle cx="32" cy="18" r="8" /><path d="M32 26v20M20 34h24M18 58l14-12 14 12" /><path d="M16 14a18 18 0 0 1 6-8M48 14a18 18 0 0 0-6-8" stroke="var(--brand)" /></>),
  ombros: svg(<><circle cx="32" cy="14" r="7" /><path d="M32 21v22M22 26h20M24 58l8-15 8 15" /><circle cx="18" cy="24" r="6" stroke="var(--brand)" strokeDasharray="4 3" /><circle cx="46" cy="24" r="6" stroke="var(--brand)" strokeDasharray="4 3" /></>),
  "gato-camelo": svg(<><path d="M6 56h52" opacity=".4" /><path d="M14 56V40M46 56V40" /><path d="M12 40c8-14 28-14 36 0" stroke="var(--brand)" /><circle cx="54" cy="36" r="5" /></>),
  ponte: svg(<><path d="M4 56h56" opacity=".4" /><circle cx="10" cy="50" r="5" /><path d="M16 52l14-14 12 6 6 12" /><path d="M30 30v-8M26 26l4-4 4 4" stroke="var(--brand)" /></>),
  "agachamento-parede": svg(<><path d="M14 6v52M14 58h44" opacity=".4" /><circle cx="22" cy="14" r="6" /><path d="M20 20v18h16v18" /><path d="M20 28l12 4" /></>),
  "quadriceps-toalha": svg(<><path d="M4 56h56" opacity=".4" /><circle cx="10" cy="40" r="5" /><path d="M14 44l10 4h30" /><rect x="26" y="50" width="12" height="6" rx="2" stroke="var(--brand)" /></>),
};

function Card({ e }: { e: GenericExercise }) {
  const toggle = useAction({
    run: (done: boolean) => api(`/me/exercises/${e.id}/done`, { body: { done } }),
    optimistic: {
      key: q.home.queryKey,
      update: (old: Full, done: boolean) => ({ ...old, generic: old.generic.map((x) => (x.id === e.id ? { ...x, doneAt: done ? new Date() : null } : x)) }),
    },
  });
  const id = `ex-${e.id}`;
  return (
    <li className={cx("flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 transition-opacity duration-200", e.doneAt && "opacity-75")} aria-labelledby={id}>
      <div className="flex gap-3">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-ink">{ART[e.slug] ?? <Dumbbell aria-hidden strokeWidth={1.5} className="size-8" />}</span>
        <div className="min-w-0">
          <h3 id={id} className={cx("font-semibold", e.doneAt && "line-through")}>{e.name}</h3>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge tone={e.category === "Mobilidade" ? "info" : "accent"}>{e.category}</Badge>
            <Badge>{e.region}</Badge>
            <Badge tone="ok">Nível {e.level.toLowerCase()}</Badge>
          </div>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl bg-surface-2 p-2.5"><dt className="text-xs text-ink-3">Séries x repetições</dt><dd className="font-semibold">{e.prescription}</dd></div>
        <div className="rounded-xl bg-surface-2 p-2.5"><dt className="text-xs text-ink-3">Descanso</dt><dd className="font-semibold">{e.rest}</dd></div>
      </dl>
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex min-h-11 flex-1 basis-40 cursor-pointer items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={!!e.doneAt} onChange={(ev) => toggle.mutate(ev.target.checked)} className="size-6 shrink-0 accent-[var(--accent)]" />
          Marcar como feito
        </label>
        {e.videoUrl && (
          <a href={e.videoUrl} target="_blank" rel="noopener noreferrer" className="btn btn-line flex-1 basis-48">
            <ExternalLink aria-hidden strokeWidth={1.5} className="size-4" />Ver vídeo no YouTube<span className="sr-only"> (abre em nova aba)</span>
          </a>
        )}
      </div>
      <p className="text-xs text-ink-3">
        {e.videoUrl && <>Vídeo de terceiros, apenas como referência geral. </>}Pare se sentir dor forte e fale com sua fisioterapeuta.
      </p>
    </li>
  );
}

const TITLE = "Exercícios prévios: mobilidade e fortalecimento";

/** Aberto enquanto a fisioterapeuta não passou exercícios; depois desce recolhido. */
export function GenericExercises({ items, collapsed, className }: { items: GenericExercise[]; collapsed?: boolean; className?: string }) {
  if (!items.length) return null;
  const done = items.filter((e) => e.doneAt).length;
  const badge = <Badge tone={done === items.length ? "ok" : "neutral"}>{done}/{items.length} feitos</Badge>;
  const list = <div className="@container"><ul className="mt-4 grid gap-3 @2xl:grid-cols-2">{items.map((e) => <Card key={e.id} e={e} />)}</ul></div>;
  if (collapsed)
    return (
      <details className={cx("card group p-5 sm:p-6", className)}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl font-semibold [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-3"><Tile tone="info"><Dumbbell /></Tile>{TITLE}</span>
          <span className="flex items-center gap-2">{badge}<ChevronDown aria-hidden className="size-4 transition-transform duration-200 group-open:rotate-180" /></span>
        </summary>
        <p className="mt-3 text-sm text-ink-2">{FIXED_PHRASE}</p>
        {list}
      </details>
    );
  return (
    <section aria-labelledby="ex-previos" className={cx("card p-5 sm:p-6", className)}>
      <div className="flex items-start justify-between gap-3">
        <h2 id="ex-previos" className="flex items-center gap-3 font-semibold"><Tile tone="info"><Dumbbell /></Tile>{TITLE}</h2>
        {badge}
      </div>
      <p className="mt-2 text-sm text-ink-2">{FIXED_PHRASE}</p>
      {list}
    </section>
  );
}
