"use client";

import { ROTEIRO_1_MINUTO } from "@content/mensagens-progresso";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { MISS_REASON_LABELS, RENEWAL_LABEL, SESSION_STATUS, formatPhone } from "@/lib/labels";
import { fmtTime, fmtWeekShort } from "@/lib/time";
import type { staffTreatmentDetail } from "@/server/services/patients";
import { MissSheet, type MissInput } from "./miss-sheet";
import { ProgressRing } from "./progress-ring";
import { useAction } from "./providers";
import { Badge, Button, Card, ErrorState, Input, ListSkeleton, Textarea } from "./ui";

type Detail = Awaited<ReturnType<typeof staffTreatmentDetail>>;

export function TreatmentDetail({ id }: { id: string }) {
  const key = ["treatment", id];
  const { data: t, isLoading, error, refetch } = useQuery({
    queryKey: key, queryFn: () => api<Detail>(`/physio/treatments/${id}`), placeholderData: undefined,
  });
  const [checks, setChecks] = useState<number[]>([]);
  const [abandoning, setAbandoning] = useState(false);
  const [miss, setMiss] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);

  const done = useAction({
    run: (sid: string) => api(`/physio/sessions/${sid}/done`, { body: {} }),
    optimistic: {
      key,
      update: (old: Detail, sid: string) => ({
        ...old, completedSessions: old.completedSessions + 1,
        sessions: old.sessions.map((s) => (s.id === sid ? { ...s, status: "REALIZADA" } : s)),
      }),
    },
    invalidate: [["physio-patients"], ["physio-agenda"]],
  });
  const missed = useAction({
    run: ({ sid, ...body }: MissInput & { sid: string }) => api(`/physio/sessions/${sid}/miss`, { body }),
    optimistic: {
      key,
      update: (old: Detail, v: MissInput & { sid: string }) => ({ ...old, sessions: old.sessions.map((s) => (s.id === v.sid ? { ...s, status: v.status, reason: v.reason } : s)) }),
    },
    invalidate: [["physio-agenda"]], success: "Registrado. Reposição criada ao fim do plano.",
  });
  const pain = useAction({
    run: ({ sid, score }: { sid: string; score: number }) => api(`/physio/sessions/${sid}/pain`, { body: { score } }),
    optimistic: {
      key,
      update: (old: Detail, v: { sid: string; score: number }) => ({ ...old, sessions: old.sessions.map((s) => (s.id === v.sid ? { ...s, painScore: v.score } : s)) }),
    },
  });
  const script = useAction({
    run: () => api(`/physio/treatments/${id}/script`, { body: {} }),
    optimistic: { key, update: (old: Detail) => ({ ...old, scriptDoneAt: new Date() }) }, success: "Roteiro registrado",
  });
  const abandon = useAction({
    run: (v: MissInput) => api(`/physio/treatments/${id}/abandon`, { body: { reason: v.reason, note: v.note } }),
    optimistic: { key, update: (old: Detail) => ({ ...old, status: "ABANDONADO" }) },
    invalidate: [["physio-patients"]], success: "Abandono registrado",
  });
  const guidance = useAction({
    run: (f: FormData) => api(`/physio/treatments/${id}/guidance`, { form: f }),
    invalidate: [key], success: "Orientação enviada ao paciente", onDone: () => form.current?.reset(),
  });

  const sendGuidance = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    guidance.mutate(new FormData(e.currentTarget));
  };

  if (isLoading) return <ListSkeleton />;
  if (error || !t) return <ErrorState error={error} retry={refetch} />;

  const active = t.status === "ATIVO";
  const showScript = active && t.completedSessions >= 2 && t.completedSessions <= 5 && !t.scriptDoneAt;

  return (
    <div>
      <div className="mb-4">
        <p className="text-sm text-ink-3">{t.unit.name}</p>
        <h2 className="font-display text-3xl">{t.patient.user.name}</h2>
      </div>
      <div className="grid items-start gap-4 2xl:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Card className="grid items-center gap-6 sm:grid-cols-[220px_minmax(0,1fr)]">
            <ProgressRing done={t.completedSessions} total={t.totalSessions} />
            <div>
              <dl className="flex flex-col gap-2 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-ink-3">CPF</dt><dd>{t.patient.cpf}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-ink-3">Telefone</dt><dd>{formatPhone(t.patient.phone)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-ink-3">Tipo</dt><dd>{t.patient.type === "CONVENIO" ? t.patient.insurer : "Particular"}</dd></div>
                {t.renewal && <div className="flex justify-between gap-3"><dt className="text-ink-3">Renovação</dt><dd>{RENEWAL_LABEL[t.renewal.status]}</dd></div>}
                {t.patient.secondContactPhone && <div className="flex justify-between gap-3"><dt className="text-ink-3">2º contato</dt><dd className="text-right">{t.patient.secondContactName} · {formatPhone(t.patient.secondContactPhone)}</dd></div>}
              </dl>
              {active && <Button variant="danger" className="mt-4 w-full" onClick={() => setAbandoning(true)}>Registrar abandono</Button>}
            </div>
          </Card>

          {showScript && (
            <Card className="border-accent/40">
              <h3 className="font-semibold">Roteiro de 1 minuto</h3>
              <p className="text-sm text-ink-2">Antes da fase em que a dor some, combine com o paciente a importância das sessões finais.</p>
              <ul className="mt-2">
                {ROTEIRO_1_MINUTO.map((item, i) => (
                  <li key={item}>
                    <label className="flex min-h-11 items-center gap-3 text-sm">
                      <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={checks.includes(i)}
                        onChange={(e) => setChecks(e.target.checked ? [...checks, i] : checks.filter((c) => c !== i))} />
                      {item}
                    </label>
                  </li>
                ))}
              </ul>
              <Button className="mt-2" disabled={checks.length < ROTEIRO_1_MINUTO.length} onClick={() => script.mutate()}>Concluir roteiro</Button>
            </Card>
          )}

          <Card>
            <h3 className="mb-3 font-semibold">Enviar orientação</h3>
            <form ref={form} onSubmit={sendGuidance} className="flex flex-col gap-3">
              <Input label="Título" name="title" required maxLength={120} placeholder="Alongamento para fazer em casa" />
              <Textarea label="Mensagem" name="message" maxLength={1000} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Link de vídeo (https)" name="url" type="url" />
                <Input label="Arquivo (até 50 MB)" name="file" type="file" accept="video/mp4,video/webm,application/pdf,image/jpeg,image/png" />
              </div>
              <Button type="submit" loading={guidance.isPending}>Enviar ao paciente</Button>
            </form>
            {!!t.guidances.length && (
              <ul className="mt-4 divide-y divide-line border-t border-line text-sm">
                {t.guidances.map((g) => <li key={g.id} className="py-2">{g.title}</li>)}
              </ul>
            )}
          </Card>
        </div>

        <Card>
          <h3 className="mb-2 font-semibold">Sessões</h3>
          <ul className="divide-y divide-line">
            {t.sessions.filter((s) => s.status !== "REAGENDADA").map((s) => {
              const open = s.status === "AGENDADA" || s.status === "CONFIRMADA";
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                  <span className="w-6 text-ink-3 tabular-nums">{s.number}</span>
                  <span className="min-w-0 flex-1 basis-32">
                    <span className="block first-letter:uppercase">{fmtWeekShort(s.startsAt)} · {fmtTime(s.startsAt)}</span>
                    {s.reason && <span className="block text-sm text-ink-3">{MISS_REASON_LABELS[s.reason] ?? s.reason}</span>}
                  </span>
                  <Badge tone={SESSION_STATUS[s.status].tone}>{SESSION_STATUS[s.status].label}</Badge>
                  {s.provisional && <Badge tone="warn">Pré-reserva</Badge>}
                  {(s.status === "REALIZADA" || s.status === "CONFIRMADA") && (
                    <select aria-label={`Dor relatada na sessão ${s.number}`} value={s.painScore ?? ""}
                      onChange={(e) => e.target.value && pain.mutate({ sid: s.id, score: Number(e.target.value) })}
                      className="field min-h-9 w-auto px-2 text-sm">
                      <option value="">Dor –</option>
                      {Array.from({ length: 11 }, (_, n) => <option key={n} value={n}>Dor {n}</option>)}
                    </select>
                  )}
                  {open && (
                    <div className="flex w-full gap-2">
                      <Button className="flex-1" onClick={() => done.mutate(s.id)}>Realizada</Button>
                      <Button variant="line" className="flex-1" onClick={() => setMiss(s.id)}>Ausência</Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
      <MissSheet open={!!miss} onClose={() => setMiss(null)} onSubmit={(v) => miss && missed.mutate({ ...v, sid: miss })} />
      <MissSheet open={abandoning} onClose={() => setAbandoning(false)} title="Registrar abandono" confirmLabel="Encerrar tratamento" hideStatus onSubmit={(v) => abandon.mutate(v)} />
    </div>
  );
}
