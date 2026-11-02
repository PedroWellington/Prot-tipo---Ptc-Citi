"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarClock, CalendarPlus, Check, Clock, ExternalLink, FileText, MapPin, Navigation, QrCode, Repeat, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { q } from "@/lib/queries";
import { RENEWAL_LABEL, SESSION_STATUS } from "@/lib/labels";
import { countdown, fmtDate, fmtLong, fmtTime, fmtWeekShort } from "@/lib/time";
import type { patientHome } from "@/server/services/patients";
import { ProgressRing } from "./progress-ring";
import { useAction } from "./providers";
import { Badge, Button, Card, cx, Empty, LinkButton, Skeleton, SuccessCheck } from "./ui";

export type Home = Awaited<ReturnType<typeof patientHome>>;
type Full = Extract<Home, { sessions: unknown }>;
type SessionRow = Full["sessions"][number];

export function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Carregando seu tratamento">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-[420px] w-full rounded-[20px]" />
      <Skeleton className="h-48 w-full rounded-[20px]" />
    </div>
  );
}

function NextCard({ s, unit, pending }: { s: SessionRow; unit: Full["treatment"]["unit"]; pending: boolean }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  const confirm = useAction({
    run: (id: string) => api(`/me/sessions/${id}/confirm`, { body: {} }),
    optimistic: {
      key: ["home"],
      update: (old: Full, id: string) => ({ ...old, sessions: old.sessions.map((x) => (x.id === id ? { ...x, status: "CONFIRMADA" } : x)) }),
    },
    success: "Presença confirmada",
  });
  const confirmed = s.status === "CONFIRMADA";
  const unpaid = s.payment?.status === "AGUARDANDO";
  const maps = `https://www.google.com/maps/dir/?api=1&destination=${unit.lat},${unit.lng}`;

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-ink-3" suppressHydrationWarning>Próxima sessão · {countdown(s.startsAt)}</p>
          <h2 className="mt-1 font-display text-[28px] leading-tight first-letter:uppercase">{fmtLong(s.startsAt)}</h2>
          <p className="text-ink-2">{fmtTime(s.startsAt)} · {s.unit.name} · {s.physio.user.name}</p>
        </div>
        {confirmed && <Badge tone="accent"><Check className="size-3.5" />Confirmada</Badge>}
      </div>
      {s.provisional && <p className="mt-3 text-sm text-warn">Horário pré-reservado, aguardando a liberação do convênio.</p>}
      {unpaid && <p className="mt-3 text-sm text-warn">Reservada: confirma depois do pagamento.</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        {!confirmed && !unpaid && <Button variant="brand" className="flex-1" onClick={() => confirm.mutate(s.id)}>Confirmar presença</Button>}
        {unpaid ? null : pending ? <Badge tone="warn" className="min-h-11 px-4">Troca em andamento</Badge> : (
          <LinkButton variant="ghost" href={`/app/troca?sessao=${s.id}`} className="flex-1"><Repeat strokeWidth={1.5} className="size-4" />Solicitar troca</LinkButton>
        )}
        <a href={maps} target="_blank" rel="noreferrer" className="btn btn-line flex-1"><Navigation strokeWidth={1.5} className="size-4" />Como chegar</a>
      </div>
    </Card>
  );
}

function RenewalCard({ r }: { r: NonNullable<Full["renewal"]> }) {
  const copy: Record<string, string> = {
    NAO_INICIADA: "Vamos pedir a liberação das próximas sessões antes que você precise se preocupar.",
    SOLICITADA: `Já pedimos a renovação · prazo estimado de ${r.estimateDays} dias · seu horário da 6ª sessão está guardado.`,
    EM_ANALISE: `O convênio está analisando · prazo estimado de ${r.estimateDays} dias · seu horário da 6ª sessão está guardado.`,
    LIBERADA: "Renovação liberada. Suas próximas sessões estão autorizadas.",
    NEGADA: r.heldReleased ? "A renovação não foi aprovada. Fale com a recepção para ver alternativas." : "A renovação não foi aprovada. A recepção vai falar com você, e seus horários seguem guardados por enquanto.",
  };
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold"><ShieldCheck strokeWidth={1.5} className="size-5 text-accent" />Convênio</h2>
        <Badge tone={r.status === "LIBERADA" ? "ok" : r.status === "NEGADA" ? "danger" : "warn"}>{RENEWAL_LABEL[r.status]}</Badge>
      </div>
      <p className="mt-2 text-ink-2">{copy[r.status]}</p>
    </Card>
  );
}

function Guidances({ items }: { items: Full["treatment"]["guidances"] }) {
  return (
    <Card>
      <h2 className="font-semibold">Orientações da sua fisioterapeuta</h2>
      <ul className="mt-2 flex flex-col divide-y divide-line">
        {items.map((g) => (
          <li key={g.id} className="py-3">
            <p className="font-medium">{g.title}</p>
            {g.message && <p className="text-sm text-ink-2">{g.message}</p>}
            <div className="flex flex-wrap gap-3">
              {g.url && <a href={g.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent"><ExternalLink strokeWidth={1.5} className="size-4" />Abrir link</a>}
              {g.fileName && <a href={`/api/files/${g.fileName}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent"><FileText strokeWidth={1.5} className="size-4" />Ver arquivo</a>}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

const DOT: Record<string, string> = {
  REALIZADA: "bg-ok text-on-accent", CONFIRMADA: "ring-1 ring-accent text-accent", AGENDADA: "ring-1 ring-line-strong text-ink-3",
  FALTA: "ring-1 ring-danger text-danger", DESMARCADA: "ring-1 ring-warn text-warn", REAGENDADA: "ring-1 ring-line text-ink-3",
};

function Timeline({ sessions, nextId }: { sessions: SessionRow[]; nextId: string | null }) {
  const shown = sessions.filter((s) => s.status !== "REAGENDADA");
  return (
    <Card>
      <h2 className="font-semibold">Linha do tempo</h2>
      <ol className="mt-3 lg:columns-2 xl:columns-1">
        {shown.map((s, i) => {
          const isNext = s.id === nextId;
          return (
            <li key={s.id} className="relative flex break-inside-avoid gap-3 pb-3 last:pb-0">
              {i < shown.length - 1 && <span aria-hidden className="absolute top-8 bottom-0 left-[15px] w-px bg-line" />}
              <span className={cx("flex size-8 shrink-0 items-center justify-center rounded-full text-sm tabular-nums", DOT[s.status], isNext && "bg-accent-soft")}>
                {s.status === "REALIZADA" ? <Check className="size-4" /> : s.status === "FALTA" ? <X className="size-4" /> : s.number}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cx("flex flex-wrap items-center gap-2", isNext && "font-semibold")}>
                  {fmtWeekShort(s.startsAt)} · {fmtTime(s.startsAt)}
                  {isNext && <Badge tone="accent">Próxima</Badge>}
                  {s.status !== "AGENDADA" && !isNext && <Badge tone={SESSION_STATUS[s.status].tone}>{SESSION_STATUS[s.status].label}</Badge>}
                  {s.provisional && <Badge tone="warn">Pré-reserva</Badge>}
                  {s.payment?.status === "AGUARDANDO" && <Badge tone="warn">Aguardando pagamento</Badge>}
                </p>
                <p className="truncate text-sm text-ink-3">{s.unit.name} · {s.physio.user.name}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function Summary({ done, total, next }: { done: number; total: number; next?: SessionRow }) {
  const items = [["Feitas", done], ["Restantes", total - done], ["Próxima", next ? fmtDate(next.startsAt) : "–"]] as const;
  return (
    <Card className="grid grid-cols-3 gap-2">
      {items.map(([label, value]) => (
        <div key={label}>
          <p className="text-sm text-ink-3">{label}</p>
          <p className="font-display text-3xl leading-tight tabular-nums">{value}</p>
        </div>
      ))}
    </Card>
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
      <h2 className="flex items-center gap-2 font-semibold"><MapPin strokeWidth={1.5} className="size-5 text-accent" />Sua unidade</h2>
      <p className="mt-2 font-display text-2xl">{unit.name}</p>
      <p className="text-sm text-ink-2">{unit.address}</p>
      <Link href="/app/unidades" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-accent">Ver a mais perto de você</Link>
    </Card>
  );
}

export function HomeClient({ initial, name, serverAt }: { initial: Home; name: string; serverAt: number }) {
  const { data = initial } = useQuery({
    ...q.home, initialData: initial, initialDataUpdatedAt: serverAt,
    // Mudanças feitas pela fisioterapeuta ou recepção aparecem sem recarregar
    refetchInterval: 30_000,
  });

  if (!data.treatment)
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-[34px] leading-tight">Olá, {name}</h1>
        <Card className="flex flex-col items-center text-center">
          <ProgressRing done={0} total={10} />
          <p className="mt-6 max-w-prose text-ink-2">{data.message}</p>
          <LinkButton variant="brand" href="/app/agendar" className="mt-5 w-full sm:w-auto">Agendar meu tratamento</LinkButton>
        </Card>
      </div>
    );

  const { treatment: t, sessions, renewal, pendingRequest, pendingPayment, late } = data as Full;
  const next = sessions.find((s) => s.id === data.nextSessionId);
  const ended = t.status !== "ATIVO";

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-[34px] leading-tight">Olá, {name}</h1>

      {pendingRequest && (
        <Link href="/app/troca" className="card flex items-center gap-3 border-warn/40 p-4">
          <Clock strokeWidth={1.5} className="size-5 shrink-0 text-warn" />
          <span className="text-sm"><b className="font-semibold">Solicitação em andamento</b>, aguardando a recepção autorizar. Seu horário original continua reservado.</span>
        </Link>
      )}

      {pendingPayment && (
        <Link href={`/app/pagamento/${pendingPayment}`} className="card flex items-center gap-3 border-warn/40 p-4">
          <QrCode strokeWidth={1.5} className="size-5 shrink-0 text-warn" />
          <span className="text-sm"><b className="font-semibold">Pagamento pendente.</b> Conclua o PIX para garantir sua reserva.</span>
        </Link>
      )}
      {late && <LateCard late={late} />}

      <div className="grid items-start gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col items-center text-center">
            <Badge tone="accent" className="mb-3">{t.phase}</Badge>
            <ProgressRing done={t.done} total={t.total} />
            {t.finished && <div className="mt-4"><SuccessCheck /></div>}
            <p key={t.done} className="page-enter mt-4 max-w-prose leading-relaxed text-ink-2">{data.message}</p>
          </Card>
          {!ended && <LinkButton variant="ghost" href="/app/agendar"><CalendarPlus strokeWidth={1.5} className="size-4" />Agendar mais sessões</LinkButton>}
        </div>
        <div className="flex flex-col gap-4">
          {next && <NextCard s={next} unit={t.unit} pending={!!pendingRequest} />}
          {!next && !ended && (
            <Card><Empty art={<CalendarClock strokeWidth={1.2} className="size-10 text-ink-3" />} title="Sem sessões futuras" body="Fale com a recepção para retomar sua agenda." /></Card>
          )}
          {ended && (
            <Card>
              <h2 className="font-display text-2xl">{t.finished ? "Tratamento concluído" : "Tratamento encerrado"}</h2>
              <p className="mt-2 text-ink-2">Precisando, é só começar um novo plano.</p>
              <LinkButton variant="ghost" href="/app/agendar" className="mt-4 w-full">Agendar novo tratamento</LinkButton>
            </Card>
          )}
          <Summary done={t.done} total={t.total} next={next} />
          {renewal && !ended && <RenewalCard r={renewal} />}
          <UnitCard unit={t.unit} />
        </div>
        <div className="flex flex-col gap-4 lg:col-span-2 xl:col-span-1">
          {!!t.guidances.length && <Guidances items={t.guidances} />}
          <Timeline sessions={sessions} nextId={data.nextSessionId} />
        </div>
      </div>
    </div>
  );
}
