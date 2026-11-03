"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Award, CalendarCheck, CalendarClock, CalendarPlus, Check, CircleCheckBig, Clock, ExternalLink, FileText, Flag, Flame, Lock, MapPin,
  Navigation, PlayCircle, Percent, Repeat, ShieldCheck, Sparkles, Star, Target, UserRound, X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { q } from "@/lib/queries";
import { NOTA_ENDERECO } from "@/lib/unidades";
import { SESSION_STATUS, type Tone } from "@/lib/labels";
import { attendance, STAGES, stageOf } from "@/lib/progress";
import { countdown, fmtLong, fmtTime, fmtWeekShort } from "@/lib/time";
import type { patientHome } from "@/server/services/patients";
import { ExpiredNotice, PendingPaymentNotice } from "./payment-notices";
import { ProgressRing } from "./progress-ring";
import { useAction } from "./providers";
import { Badge, Button, Card, cx, Empty, LinkButton, Skeleton, SuccessCheck, Tile } from "./ui";

export type Home = Awaited<ReturnType<typeof patientHome>>;
type Full = Extract<Home, { sessions: unknown }>;
type SessionRow = Full["sessions"][number];

const DAY_MS = 86_400_000;
const initials = (name: string) => name.split(" ").filter((w) => !w.endsWith(".")).slice(0, 2).map((w) => w[0]).join("");

export function HomeSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12" role="status" aria-label="Carregando seu tratamento">
      <Skeleton className="h-64 rounded-[20px] lg:col-span-8" />
      <div className="grid grid-cols-2 gap-3 lg:col-span-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-30 rounded-[20px]" />)}</div>
      <Skeleton className="h-64 rounded-[20px] lg:col-span-5" />
      <Skeleton className="h-64 rounded-[20px] lg:col-span-7" />
      <Skeleton className="h-36 rounded-[20px] lg:col-span-12" />
    </div>
  );
}

function SectionTitle({ icon, tone, children, aside }: { icon: ReactNode; tone?: Tone; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-3 font-semibold"><Tile tone={tone}>{icon}</Tile>{children}</h2>
      {aside}
    </div>
  );
}

// ── 1. Hero ───────────────────────────────────────────────────
function Hero({ name, done, total, message, finished, children }: { name: string; done: number; total: number; message: string; finished?: boolean; children: ReactNode }) {
  const stage = STAGES[stageOf(done, total)];
  return (
    <Card className="hero grid items-center gap-6 sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)] lg:col-span-8">
      <div className="relative">
        <ProgressRing done={done} total={total} />
        {finished && <div className="absolute -right-1 -bottom-1"><SuccessCheck /></div>}
      </div>
      <div className="flex flex-col items-start gap-3">
        <Badge tone="accent"><Sparkles className="size-3.5" />Fase: {stage.name}</Badge>
        <h1 className="font-display text-[34px] leading-tight sm:text-[40px]">Olá, {name}</h1>
        <p key={done} className="page-enter max-w-prose leading-relaxed text-ink-2">{message || stage.hint}</p>
        <div className="mt-1 flex w-full flex-wrap gap-2 sm:w-auto">{children}</div>
      </div>
    </Card>
  );
}

// ── 2. Métricas ───────────────────────────────────────────────
function Metric({ icon, tone, label, value, hint }: { icon: ReactNode; tone: Tone; label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="card flex flex-col gap-2 p-4">
      <Tile tone={tone}>{icon}</Tile>
      <p className="text-sm text-ink-2">{label}</p>
      <p className="font-display text-[32px] leading-none tabular-nums">{value}</p>
      {hint && <p className="text-xs text-ink-3">{hint}</p>}
    </div>
  );
}

function Metrics({ done, total, sessions }: { done: number; total: number; sessions: SessionRow[] }) {
  const { presence, streak } = attendance(sessions);
  return (
    <div className="grid grid-cols-2 gap-3 lg:col-span-4">
      <Metric icon={<CircleCheckBig />} tone="ok" label="Feitas" value={done} hint={`de ${total} sessões`} />
      <Metric icon={<Target />} tone="info" label="Restantes" value={total - done} />
      <Metric icon={<Percent />} tone={presence !== null && presence < 80 ? "warn" : "accent"} label="Presença" value={presence === null ? "–" : `${presence}%`} />
      <Metric icon={<Flame />} tone="danger" label="Sequência" value={streak} hint={streak === 1 ? "sessão sem faltar" : "sessões sem faltar"} />
    </div>
  );
}

// ── Dor de hoje: seletor rápido 0–10 ──────────────────────────
const painTone = (n: number) => (n <= 3 ? "bg-ok-soft text-ok" : n <= 6 ? "bg-warn-soft text-warn" : "bg-danger-soft text-danger");

function PainPicker({ sessionId }: { sessionId: string }) {
  const save = useAction({
    run: (score: number) => api(`/me/sessions/${sessionId}/pain`, { body: { score } }),
    optimistic: {
      key: q.home.queryKey,
      update: (old: Full, score: number) => ({ ...old, sessions: old.sessions.map((x) => (x.id === sessionId ? { ...x, painScore: score } : x)) }),
    },
    success: "Dor registrada",
  });
  return (
    <fieldset className="rise mt-4 rounded-2xl bg-surface-2 p-3">
      <legend className="sr-only">Como está sua dor hoje? De 0 (sem dor) a 10 (máxima)</legend>
      <p aria-hidden className="mb-2 text-sm font-semibold">Como está sua dor hoje?</p>
      <div className="grid grid-cols-6 gap-1 sm:grid-cols-11">
        {Array.from({ length: 11 }, (_, n) => (
          <button key={n} type="button" onClick={() => save.mutate(n)} aria-label={`Dor ${n}`}
            className={cx("flex h-11 items-center justify-center rounded-lg text-sm font-semibold tabular-nums transition-transform active:scale-95", painTone(n))}>
            {n}
          </button>
        ))}
      </div>
      <p aria-hidden className="mt-1.5 flex justify-between text-xs text-ink-3"><span>Sem dor</span><span>Máxima</span></p>
    </fieldset>
  );
}

// ── 3. Próxima sessão ─────────────────────────────────────────
function NextCard({ s, unit, pending }: { s: SessionRow; unit: Full["treatment"]["unit"]; pending: boolean }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  const confirm = useAction({
    run: (id: string) => api(`/me/sessions/${id}/confirm`, { body: {} }),
    optimistic: {
      key: q.home.queryKey,
      update: (old: Full, id: string) => ({ ...old, sessions: old.sessions.map((x) => (x.id === id ? { ...x, status: "CONFIRMADA" } : x)) }),
    },
    success: "Presença confirmada",
  });
  const confirmed = s.status === "CONFIRMADA";
  const unpaid = s.payment?.status === "AGUARDANDO";
  const maps = `https://www.google.com/maps/dir/?api=1&destination=${unit.lat},${unit.lng}`;

  return (
    <Card className="flex flex-col lg:col-span-5">
      <SectionTitle icon={<CalendarClock />} tone="info" aside={confirmed ? <Badge tone="ok"><Check className="size-3.5" />Confirmada</Badge> : <Badge tone="warn">A confirmar</Badge>}>
        Próxima sessão
      </SectionTitle>
      <p className="text-sm font-semibold text-accent" suppressHydrationWarning>{countdown(s.startsAt)}</p>
      <p className="mt-1 font-display text-[28px] leading-tight first-letter:uppercase">{fmtLong(s.startsAt)}</p>
      <p className="text-ink-2">{fmtTime(s.startsAt)} · {s.unit.name}</p>
      <div className="mt-4 flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
        <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-fill font-semibold text-on-accent">{initials(s.physio.user.name)}</span>
        <span className="min-w-0">
          <span className="block truncate font-medium">{s.physio.user.name}</span>
          <span className="block text-sm text-ink-3">Sua fisioterapeuta</span>
        </span>
      </div>
      {s.provisional && <p className="mt-3 text-sm text-warn">Horário pré-reservado, aguardando a liberação do convênio.</p>}
      {unpaid && <p className="mt-3 text-sm text-warn">Reservada: confirma depois do pagamento.</p>}
      {confirmed && s.painScore === null && <PainPicker sessionId={s.id} />}
      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        {!confirmed && !unpaid && <Button variant="brand" className="flex-1" onClick={() => confirm.mutate(s.id)}>Confirmar</Button>}
        {unpaid ? null : pending ? <Badge tone="warn" className="min-h-11 px-4">Troca em andamento</Badge> : (
          <LinkButton variant="ghost" href={`/app/troca?sessao=${s.id}`} className="flex-1"><Repeat strokeWidth={1.5} className="size-4" />Trocar horário</LinkButton>
        )}
        <a href={maps} target="_blank" rel="noreferrer" className="btn btn-line flex-1"><Navigation strokeWidth={1.5} className="size-4" />Como chegar</a>
      </div>
    </Card>
  );
}

// ── 4. Evolução da dor ────────────────────────────────────────
const W = 320, H = 150, PAD = { l: 22, r: 10, t: 10, b: 22 };

function PainChart({ sessions, className }: { sessions: SessionRow[]; className?: string }) {
  const pts = sessions.filter((s) => s.painScore !== null).map((s) => ({ n: s.number, v: s.painScore! }));
  if (!pts.length)
    return (
      <Card className={className}>
        <SectionTitle icon={<Star />} tone="danger">Evolução da dor</SectionTitle>
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <svg viewBox="0 0 160 70" className="h-20 w-44 text-ink-3" fill="none" aria-hidden>
            {[10, 35, 60].map((y) => <line key={y} x1="0" x2="160" y1={y} y2={y} stroke="var(--line-strong)" strokeDasharray="3 4" />)}
            <path d="M6 14 C 40 18, 50 40, 80 38 S 130 56, 154 58" stroke="currentColor" strokeWidth="2" strokeDasharray="5 5" strokeLinecap="round" />
          </svg>
          <p className="max-w-xs text-ink-2">Depois da 1ª sessão sua evolução aparece aqui</p>
        </div>
      </Card>
    );
  const maxN = Math.max(pts.at(-1)!.n, 2);
  const x = (n: number) => PAD.l + ((n - 1) / (maxN - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / 10) * (H - PAD.t - PAD.b);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(p.n).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(pts.at(-1)!.n).toFixed(1)} ${y(0)} L${x(pts[0].n).toFixed(1)} ${y(0)} Z`;
  const first = pts[0].v, last = pts.at(-1)!.v;
  const summary = pts.length < 2 ? `Dor ${last} registrada.` : last < first ? `Caiu de ${first} para ${last}.` : last > first ? `Subiu de ${first} para ${last}. Conte à sua fisioterapeuta.` : `Estável em ${last}.`;

  return (
    <Card className={className}>
      <SectionTitle icon={<Star />} tone="danger" aside={<Badge tone={last <= 3 ? "ok" : last <= 6 ? "warn" : "danger"}>Hoje: {last}/10</Badge>}>Evolução da dor</SectionTitle>
      <figure>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Dor por sessão, de 0 a 10. ${summary}`}>
          <defs>
            <linearGradient id="pain-a" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--brand)" stopOpacity=".28" />
              <stop offset="1" stopColor="var(--brand)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 5, 10].map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--line)" />
              <text x={PAD.l - 6} y={y(v) + 3.5} textAnchor="end" fontSize="10" fill="var(--ink-3)">{v}</text>
            </g>
          ))}
          <path d={area} fill="url(#pain-a)" className="page-enter" />
          <path d={line} pathLength={1} fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" className="draw" />
          {pts.map((p) => <circle key={p.n} cx={x(p.n)} cy={y(p.v)} r="3.5" fill="var(--surface)" stroke="var(--brand)" strokeWidth="2" />)}
          {pts.map((p) => <text key={p.n} x={x(p.n)} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--ink-3)">{p.n}ª</text>)}
        </svg>
        <figcaption className="mt-2 text-sm text-ink-2">{summary} <span className="text-ink-3">0 = sem dor.</span></figcaption>
      </figure>
    </Card>
  );
}

// ── 5. Fases ──────────────────────────────────────────────────
function Phases({ done, total }: { done: number; total: number }) {
  const current = stageOf(done, total);
  return (
    <Card className="lg:col-span-12">
      <SectionTitle icon={<Flag />} tone="accent">Fases do tratamento</SectionTitle>
      <ol className="grid grid-cols-5 gap-1">
        {STAGES.map((s, i) => (
          <li key={s.name} aria-current={i === current ? "step" : undefined} className="flex flex-col items-center gap-2 text-center">
            <span className="relative flex w-full items-center justify-center">
              {i > 0 && <span aria-hidden className={cx("absolute right-1/2 left-[-50%] h-1 rounded-full", i <= current ? "bg-brand" : "bg-surface-2")} />}
              <span className={cx("relative z-10 flex size-8 items-center justify-center rounded-full text-sm font-semibold",
                i < current ? "bg-brand text-on-accent" : i === current ? "bg-accent-fill text-on-accent ring-4 ring-accent-soft" : "bg-surface-2 text-ink-3")}>
                {i < current ? <Check className="size-4" /> : i + 1}
              </span>
            </span>
            <span className={cx("w-full text-[10px] leading-tight hyphens-auto min-[390px]:text-[11px] sm:text-sm", i === current ? "font-semibold text-ink" : "text-ink-3")}>{s.name}</span>
          </li>
        ))}
      </ol>
      <p className="mt-4 rounded-2xl bg-accent-soft p-3 text-sm text-ink"><b className="font-semibold">O que esperar:</b> {STAGES[current].hint}</p>
    </Card>
  );
}

// ── 6. Exercícios ─────────────────────────────────────────────
function Exercises({ items }: { items: Full["treatment"]["guidances"] }) {
  const toggle = useAction({
    run: ({ id, done }: { id: string; done: boolean }) => api(`/me/guidances/${id}/done`, { body: { done } }),
    optimistic: {
      key: q.home.queryKey,
      update: (old: Full, v: { id: string; done: boolean }) => ({
        ...old, treatment: { ...old.treatment, guidances: old.treatment.guidances.map((g) => (g.id === v.id ? { ...g, doneAt: v.done ? new Date() : null } : g)) },
      }),
    },
  });
  const done = items.filter((g) => g.doneAt).length;
  return (
    <Card>
      <SectionTitle icon={<PlayCircle />} tone="info" aside={!!items.length && <Badge tone={done === items.length ? "ok" : "neutral"}>{done}/{items.length} feitos</Badge>}>Exercícios da semana</SectionTitle>
      {!items.length && <p className="text-ink-2">Quando sua fisioterapeuta enviar exercícios para casa, eles aparecem aqui.</p>}
      <ul className="flex flex-col gap-2">
        {items.map((g) => (
          <li key={g.id} className={cx("flex gap-3 rounded-2xl border border-line p-3 transition-opacity", g.doneAt && "opacity-70")}>
            <input type="checkbox" checked={!!g.doneAt} onChange={(e) => toggle.mutate({ id: g.id, done: e.target.checked })}
              aria-label={`Feito: ${g.title}`} className="mt-0.5 size-6 shrink-0 accent-[var(--accent)]" />
            <div className="min-w-0 flex-1">
              <p className={cx("font-medium", g.doneAt && "line-through")}>{g.title}</p>
              {g.message && <p className="text-sm text-ink-2">{g.message}</p>}
              <div className="flex flex-wrap gap-x-4">
                {g.url && <a href={g.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent"><ExternalLink strokeWidth={1.5} className="size-4" />Ver vídeo</a>}
                {g.fileName && <a href={`/api/files/${g.fileName}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent"><FileText strokeWidth={1.5} className="size-4" />Ver arquivo</a>}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ── 7. Convênio ───────────────────────────────────────────────
const RENEWAL_STEPS = ["Pedido feito", "Em análise", "Liberado"];
const RENEWAL_STEP: Record<string, number> = { NAO_INICIADA: -1, SOLICITADA: 0, EM_ANALISE: 1, LIBERADA: 2, NEGADA: 1 };

function RenewalCard({ r }: { r: NonNullable<Full["renewal"]> }) {
  const step = RENEWAL_STEP[r.status];
  const denied = r.status === "NEGADA";
  const copy: Record<string, string> = {
    NAO_INICIADA: "Vamos pedir a liberação das próximas sessões antes que você precise se preocupar.",
    SOLICITADA: `Prazo estimado de ${r.estimateDays} dias. Seu horário está guardado.`,
    EM_ANALISE: `O convênio está analisando, prazo estimado de ${r.estimateDays} dias. Seu horário está guardado.`,
    LIBERADA: "Suas próximas sessões estão autorizadas.",
    NEGADA: r.heldReleased ? "A renovação não foi aprovada. Fale com a recepção para ver alternativas." : "A renovação não foi aprovada. A recepção vai falar com você, e seus horários seguem guardados por enquanto.",
  };
  return (
    <Card>
      <SectionTitle icon={<ShieldCheck />} tone={denied ? "danger" : step === 2 ? "ok" : "warn"}>Convênio</SectionTitle>
      <ol className="flex items-center gap-2">
        {RENEWAL_STEPS.map((label, i) => {
          const on = i <= step;
          const tone = denied && i === step ? "bg-danger text-surface" : on ? "bg-brand text-on-accent" : "bg-surface-2 text-ink-3";
          return (
            <li key={label} className="flex flex-1 flex-col items-center gap-1.5 text-center">
              <span className={cx("flex size-7 items-center justify-center rounded-full text-xs font-semibold", tone)}>
                {denied && i === step ? <X className="size-3.5" /> : on ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className={cx("text-xs", on ? "font-semibold text-ink" : "text-ink-3")}>{label}</span>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-sm text-ink-2">{copy[r.status]}</p>
    </Card>
  );
}

// ── 8. Conquistas ─────────────────────────────────────────────
function Achievements({ done, total, sessions }: { done: number; total: number; sessions: SessionRow[] }) {
  const { missed } = attendance(sessions);
  const items: { label: string; on: boolean; icon: ReactNode; tone: Tone }[] = [
    { label: "1ª sessão", on: done >= 1, icon: <Star />, tone: "info" },
    { label: "Metade do caminho", on: done >= Math.ceil(total / 2), icon: <Flag />, tone: "warn" },
    { label: "Sem faltas", on: done >= 3 && missed === 0, icon: <Flame />, tone: "danger" },
    { label: "Concluído", on: done >= total, icon: <Award />, tone: "ok" },
  ];
  return (
    <Card>
      <SectionTitle icon={<Award />} tone="warn" aside={<span className="text-sm text-ink-3">{items.filter((a) => a.on).length} de {items.length}</span>}>Conquistas</SectionTitle>
      <ul className="grid grid-cols-4 gap-2">
        {items.map((a) => (
          <li key={a.label} className="flex flex-col items-center gap-1.5 text-center">
            <span className="relative">
              <Tile tone={a.on ? a.tone : "neutral"} className={cx("size-12 rounded-2xl", !a.on && "opacity-60 grayscale")}>{a.icon}</Tile>
              {!a.on && <Lock aria-hidden className="absolute -right-1 -bottom-1 size-4 rounded-full bg-surface p-0.5 text-ink-3" />}
            </span>
            <span className={cx("text-xs leading-tight", a.on ? "font-semibold" : "text-ink-3")}>{a.label}<span className="sr-only">{a.on ? ": conquistada" : ": bloqueada"}</span></span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ── 9. Linha do tempo (compacta) ──────────────────────────────
const DOT: Record<string, string> = {
  REALIZADA: "bg-brand text-on-accent", CONFIRMADA: "ring-1 ring-accent text-accent", AGENDADA: "ring-1 ring-line-strong text-ink-3",
  FALTA: "bg-danger-soft text-danger", DESMARCADA: "bg-warn-soft text-warn", REAGENDADA: "ring-1 ring-line text-ink-3",
};

function Timeline({ sessions, nextId }: { sessions: SessionRow[]; nextId: string | null }) {
  const shown = sessions.filter((s) => s.status !== "REAGENDADA");
  return (
    <Card>
      <SectionTitle icon={<CalendarCheck />} tone="accent">Linha do tempo</SectionTitle>
      <ol className="sm:columns-2">
        {shown.map((s) => {
          const isNext = s.id === nextId;
          return (
            <li key={s.id} className={cx("flex break-inside-avoid items-center gap-2.5 rounded-xl px-1.5 py-1.5", isNext && "bg-accent-soft")}>
              <span className={cx("flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums", DOT[s.status])}>
                {s.status === "REALIZADA" ? <Check className="size-3.5" /> : s.status === "FALTA" ? <X className="size-3.5" /> : s.number}
              </span>
              <p className={cx("min-w-0 flex-1 truncate text-sm first-letter:uppercase", isNext && "font-semibold")}>
                {fmtWeekShort(s.startsAt)} · {fmtTime(s.startsAt)}
              </p>
              {isNext && <Badge tone="accent">Próxima</Badge>}
              {s.status !== "AGENDADA" && s.status !== "REALIZADA" && !isNext && <Badge tone={SESSION_STATUS[s.status].tone}>{SESSION_STATUS[s.status].label}</Badge>}
              {s.provisional && <Badge tone="warn">Pré-reserva</Badge>}
              {s.payment?.status === "AGUARDANDO" && <Badge tone="warn">A pagar</Badge>}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

// ── 10. Atalhos ───────────────────────────────────────────────
const SHORTCUTS = [
  { href: "/app/agendar", label: "Agendar", icon: <CalendarPlus />, tone: "accent" },
  { href: "/app/troca", label: "Trocar", icon: <Repeat />, tone: "info" },
  { href: "/app/unidades", label: "Unidades", icon: <MapPin />, tone: "warn" },
  { href: "/app/perfil", label: "Perfil", icon: <UserRound />, tone: "danger" },
] as const;

function Shortcuts() {
  return (
    <nav aria-label="Atalhos" className="grid grid-cols-4 gap-2">
      {SHORTCUTS.map((s) => (
        <Link key={s.href} href={s.href} className="card row-hover flex flex-col items-center gap-2 p-3 text-center text-sm font-medium transition-transform active:scale-[.97]">
          <Tile tone={s.tone}>{s.icon}</Tile>{s.label}
        </Link>
      ))}
    </nav>
  );
}

function LateCard({ late }: { late: NonNullable<Full["late"]> }) {
  const reply = useAction({
    run: (button: string) => api(`/me/late/${late.id}/reply`, { body: { button } }),
    optimistic: { key: q.home.queryKey, update: (old: Full) => ({ ...old, late: null }) },
    success: "Obrigado por avisar",
  });
  return (
    <Card className="border-warn/40">
      <h2 className="font-semibold">Notamos que você ainda não chegou</h2>
      <p className="mt-1 text-sm text-ink-2">Sua sessão era às {fmtTime(late.session.startsAt)}. Você está a caminho?</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="ghost" className="flex-1" onClick={() => reply.mutate("caminho5")}>A caminho (+5 min)</Button>
        <Button variant="ghost" className="flex-1" onClick={() => reply.mutate("caminho15")}>A caminho (+15 min)</Button>
        <Button variant="line" className="flex-1" onClick={() => reply.mutate("nao")}>Não vou conseguir</Button>
      </div>
    </Card>
  );
}

function UnitCard({ unit }: { unit: Full["treatment"]["unit"] }) {
  return (
    <Card>
      <SectionTitle icon={<MapPin />} tone="warn">Sua unidade</SectionTitle>
      <p className="font-display text-2xl">{unit.name}</p>
      <p className="text-sm text-ink-2">{unit.address}</p>
      <p className="text-xs text-ink-3">{NOTA_ENDERECO}</p>
      <Link href="/app/unidades" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-accent">Ver a mais perto de você</Link>
    </Card>
  );
}

/** Abaixo da dobra: o navegador só pinta quando chega perto da tela. */
const below = "[content-visibility:auto] [contain-intrinsic-size:auto_480px]";

export function HomeClient({ initial, name, serverAt }: { initial: Home; name: string; serverAt: number }) {
  const { data = initial } = useQuery({
    ...q.home, initialData: initial, initialDataUpdatedAt: serverAt,
    // Mudanças feitas pela fisioterapeuta ou recepção aparecem sem recarregar
    refetchInterval: 30_000,
  });

  // Sem pacote: o mesmo desenho do painel em andamento, com tudo zerado
  if (!data.treatment)
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {data.expiredPayment && <div className="lg:col-span-12"><ExpiredNotice id={data.expiredPayment} /></div>}
        <Hero name={name} done={0} total={10} message={data.message}>
          <LinkButton variant="brand" href="/app/agendar" className="flex-1 sm:flex-none"><CalendarPlus strokeWidth={1.5} className="size-4" />Agendar meu tratamento</LinkButton>
        </Hero>
        <Metrics done={0} total={10} sessions={[]} />
        <Card className="flex flex-col lg:col-span-5">
          <SectionTitle icon={<CalendarClock />} tone="info">Próxima sessão</SectionTitle>
          <Empty art={<CalendarPlus strokeWidth={1.2} className="size-10 text-brand" />} title="Nenhuma sessão ainda" body="Escolha 2 horários na semana e o plano de 10 sessões fica pronto."
            action={<LinkButton variant="ghost" href="/app/agendar">Ver horários livres</LinkButton>} />
        </Card>
        <PainChart sessions={[]} className="lg:col-span-7" />
        <Phases done={0} total={10} />
        <div className={cx("flex flex-col gap-4 lg:col-span-7", below)}>
          <Exercises items={[]} />
        </div>
        <div className={cx("flex flex-col gap-4 lg:col-span-5", below)}>
          <Shortcuts />
          <Achievements done={0} total={10} sessions={[]} />
        </div>
      </div>
    );

  const { treatment: t, sessions, renewal, pendingRequest, pendingPayment, late } = data as Full;
  const next = sessions.find((s) => s.id === data.nextSessionId);
  const ended = t.status !== "ATIVO";
  const recent = t.guidances.filter((g) => serverAt - new Date(g.createdAt).getTime() < 7 * DAY_MS);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      {(pendingRequest || data.expiredPayment || pendingPayment || late) && (
        <div className="flex flex-col gap-3 lg:col-span-12">
          {pendingRequest && (
            <Link href="/app/troca" className="card flex items-center gap-3 border-warn/40 p-4">
              <Tile tone="warn"><Clock /></Tile>
              <span className="text-sm"><b className="font-semibold">Solicitação em andamento</b>, aguardando a recepção autorizar. Seu horário original continua reservado.</span>
            </Link>
          )}
          {data.expiredPayment && <ExpiredNotice id={data.expiredPayment} />}
          {pendingPayment && <PendingPaymentNotice id={pendingPayment} />}
          {late && <LateCard late={late} />}
        </div>
      )}

      <Hero name={name} done={t.done} total={t.total} message={data.message} finished={t.finished}>
        <LinkButton variant="brand" href="/app/agendar" className="flex-1 sm:flex-none">
          <CalendarPlus strokeWidth={1.5} className="size-4" />{ended ? "Agendar novo tratamento" : "Agendar mais sessões"}
        </LinkButton>
      </Hero>
      <Metrics done={t.done} total={t.total} sessions={sessions} />

      {next ? <NextCard s={next} unit={t.unit} pending={!!pendingRequest} /> : (
        <Card className="flex flex-col lg:col-span-5">
          <SectionTitle icon={<CalendarClock />} tone="info">Próxima sessão</SectionTitle>
          {ended
            ? <Empty art={<Award strokeWidth={1.2} className="size-10 text-brand" />} title={t.finished ? "Tratamento concluído" : "Tratamento encerrado"} body="Precisando, é só começar um novo plano."
                action={<LinkButton variant="ghost" href="/app/agendar">Ver horários livres</LinkButton>} />
            : <Empty art={<CalendarClock strokeWidth={1.2} className="size-10 text-ink-3" />} title="Sem sessões futuras" body="Fale com a recepção para retomar sua agenda." />}
        </Card>
      )}
      <PainChart sessions={sessions} className="lg:col-span-7" />

      <Phases done={t.done} total={t.total} />

      <div className={cx("flex flex-col gap-4 lg:col-span-7", below)}>
        <Exercises items={recent.length ? recent : t.guidances.slice(0, 3)} />
        <Timeline sessions={sessions} nextId={data.nextSessionId} />
      </div>
      <div className={cx("flex flex-col gap-4 lg:col-span-5", below)}>
        <Shortcuts />
        {renewal && !ended && <RenewalCard r={renewal} />}
        <Achievements done={t.done} total={t.total} sessions={sessions} />
        <UnitCard unit={t.unit} />
      </div>
    </div>
  );
}
