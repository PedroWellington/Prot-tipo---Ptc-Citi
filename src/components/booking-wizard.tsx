"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, CalendarDays, CalendarPlus, Flame, MapPin, Package, Receipt, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import { q } from "@/lib/queries";
import { BOOKING_SIZES } from "@/lib/schedule";
import { WEEKDAYS, WEEKDAYS_SHORT, fmtLong, fmtTime } from "@/lib/time";
import { useUnits } from "./patient-form";
import { useAction, haptic } from "./providers";
import { Button, Card, cx, ErrorState, LinkButton, Skeleton, SuccessCheck, Tile } from "./ui";

type Grid = { days: { weekday: number; hours: { hour: number; peak: boolean; level: string }[] }[]; saturdayEnabled: boolean };
type Pick = { weekday: number; hour: number };
type Result = { firstSession: string; lastSession: string; paymentId: string | null; count: number };

const LEVEL: Record<string, string> = {
  alta: "bg-accent-soft text-ink",
  media: "bg-accent-soft text-ink-2",
  baixa: "bg-surface-2 text-ink-2",
  nenhuma: "text-ink-3/50",
};

/** Etapas: tipo → unidade → fisioterapeuta → horários → revisão. `patientId` = recepção agendando em nome do paciente. */
export function BookingWizard({ patientId, initialUnit, onBooked }: { patientId?: string; initialUnit?: string; onBooked?: () => void }) {
  const { data: units, error, refetch } = useUnits();
  const qc = useQueryClient();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [count, setCount] = useState<number>(BOOKING_SIZES.pacote);
  const single = count === BOOKING_SIZES.avulsa;
  const needed = single ? 1 : 2;
  const [unitId, setUnitId] = useState(initialUnit ?? "");
  const [physioId, setPhysioId] = useState("");
  const [picks, setPicks] = useState<Pick[]>([]);
  const [result, setResult] = useState<Result | null>(null);

  const unit = units?.find((u) => u.id === unitId);
  const info = useQuery({ ...q.bookingInfo, enabled: !patientId });
  const pays = info.data?.type === "PARTICULAR";
  const total = pays ? (info.data!.priceCents * count) / 100 : 0;
  const grid = useQuery({
    queryKey: ["grid", unitId, physioId], enabled: step >= 3 && !!unitId,
    queryFn: () => api<Grid>(`/week-grid?unitId=${unitId}${physioId ? `&physioId=${physioId}` : ""}`),
    placeholderData: undefined,
  });

  const book = useAction({
    run: () => api<Result>(patientId ? `/desk/patients/${patientId}/treatment` : "/me/treatment", {
      body: { unitId, physioId: physioId || undefined, pattern: picks, count },
    }),
    onDone: (r) => {
      haptic(30);
      qc.invalidateQueries({ queryKey: ["home"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      onBooked?.();
      if (r.paymentId && !patientId) router.push(`/app/pagamento/${r.paymentId}`);
      else setResult(r);
    },
  });

  const toggle = (p: Pick) => {
    haptic();
    setPicks((cur) => {
      if (cur.some((c) => c.weekday === p.weekday && c.hour === p.hour)) return cur.filter((c) => c !== cur.find((x) => x.weekday === p.weekday && x.hour === p.hour));
      if (single) return [p];
      const others = cur.filter((c) => c.weekday !== p.weekday);
      return [...others, p].slice(-2);
    });
  };

  if (error) return <ErrorState error={error} retry={refetch} />;

  if (result)
    return (
      <Card className="flex flex-col items-center gap-3 text-center">
        <SuccessCheck />
        <h2 className="font-display text-3xl">Sessões reservadas</h2>
        <p className="text-ink-2">{result.count === 1 ? `Sua sessão é ${fmtLong(result.firstSession)} às ${fmtTime(result.firstSession)}.` : `Criamos as ${result.count} sessões. A primeira é ${fmtLong(result.firstSession)} às ${fmtTime(result.firstSession)}, e a última, ${fmtLong(result.lastSession)}.`}{result.paymentId && " O pagamento aguarda confirmação em Pagamentos."}</p>
        {!patientId && <LinkButton variant="brand" href="/app" className="mt-2 w-full sm:w-auto">Ver meu tratamento</LinkButton>}
      </Card>
    );

  const peakChosen = picks.some((p) => grid.data?.days.find((d) => d.weekday === p.weekday)?.hours.find((h) => h.hour === p.hour)?.peak);
  const calmHours = grid.data?.days.flatMap((d) => d.hours.filter((h) => !h.peak && h.level === "alta").map((h) => h.hour));
  const suggestion = calmHours?.length ? [...new Set(calmHours)].sort((a, b) => a - b).filter((h) => h >= 9).slice(0, 3) : [];

  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const summary = [
    { icon: <Package />, tone: "accent", label: "Plano", value: single ? "1 sessão avulsa" : "Pacote de 10 sessões" },
    { icon: <MapPin />, tone: "warn", label: "Unidade", value: unit?.name ?? "A escolher" },
    { icon: <UserRound />, tone: "info", label: "Fisioterapeuta", value: unit?.physios.find((p) => p.id === physioId)?.name ?? (step > 2 ? "Sem preferência" : "A escolher") },
    { icon: <CalendarDays />, tone: "danger", label: single ? "Horário" : "Horários", value: picks.length ? [...picks].sort((a, b) => a.weekday - b.weekday).map((p) => `${WEEKDAYS_SHORT[p.weekday]} ${p.hour}h`).join(" · ") : "A escolher" },
  ] as const;

  return (
    <div className={cx("grid items-start gap-4", !patientId && "lg:grid-cols-[minmax(0,1fr)_320px]")}>
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        {step > 0 && (
          <button type="button" aria-label="Voltar" onClick={() => setStep(step - 1)} className="-ml-2 flex size-11 items-center justify-center rounded-full text-ink-2">
            <ArrowLeft strokeWidth={1.5} className="size-5" />
          </button>
        )}
        <div className="flex flex-1 gap-1.5" aria-label={`Etapa ${step + 1} de 5`}>
          {[0, 1, 2, 3, 4].map((i) => <span key={i} className={cx("h-1 flex-1 rounded-full", i <= step ? "bg-accent" : "bg-line-strong")} />)}
        </div>
      </div>

      <div key={step} className="page-enter">
        {step === 0 && (
          <div className="flex flex-col gap-3">
            <h2 className="font-display text-2xl">O que você quer agendar?</h2>
            {([[BOOKING_SIZES.pacote, "Pacote de 10 sessões", "2 vezes por semana, nos mesmos horários"], [BOOKING_SIZES.avulsa, "Uma sessão avulsa", "Uma consulta a mais, quando precisar"]] as const).map(([size, title, body]) => (
              <button key={size} type="button" onClick={() => { setCount(size); setPicks([]); setStep(unitId ? 2 : 1); }} className="card row-hover flex items-center gap-4 p-5 text-left">
                <Tile tone={size === BOOKING_SIZES.pacote ? "accent" : "info"}>{size === BOOKING_SIZES.pacote ? <Package /> : <CalendarPlus />}</Tile>
                <span><span className="block font-display text-2xl">{title}</span>
                <span className="text-sm text-ink-2">{body}{pays && ` · ${brl((info.data!.priceCents * size) / 100)}`}</span></span>
              </button>
            ))}
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-3">
            <h2 className="font-display text-2xl">Onde você prefere ser atendido?</h2>
            {!units && <Skeleton className="h-24 w-full" />}
            {units?.map((u) => (
              <button key={u.id} type="button" onClick={() => { setUnitId(u.id); setPhysioId(""); setPicks([]); setStep(2); }} className="card row-hover flex items-center gap-4 p-5 text-left">
                <Tile tone="warn"><MapPin /></Tile>
                <span><span className="block font-display text-2xl">{u.name}</span>
                <span className="text-sm text-ink-2">{u.physios.length} fisioterapeutas</span></span>
              </button>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-3">
            <h2 className="font-display text-2xl">Tem preferência de profissional?</h2>
            <button type="button" onClick={() => { setPhysioId(""); setStep(3); }} className="card row-hover p-4 text-left">
              <span className="block font-semibold">Sem preferência</span>
              <span className="text-sm text-ink-2">Mostra todos os horários da unidade</span>
            </button>
            {unit?.physios.map((p) => (
              <button key={p.id} type="button" onClick={() => { setPhysioId(p.id); setPicks([]); setStep(3); }} className="card row-hover p-4 text-left font-semibold">{p.name}</button>
            ))}
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-3">
            <div>
              <h2 className="font-display text-2xl">{single ? "Escolha o dia e a hora" : "Escolha 2 horários na semana"}</h2>
              <p className="text-sm text-ink-2">{single ? "Reservamos a próxima data livre nesse horário." : "Serão os mesmos até o fim do plano: 10 sessões, 2 por semana."}</p>
            </div>
            {grid.error && <ErrorState error={grid.error} retry={grid.refetch} />}
            {grid.isLoading && <Skeleton className="h-[480px] w-full" />}
            {grid.data && (
              <>
                <div className="card overflow-hidden p-2 sm:p-3">
                  <table className="w-full table-fixed border-separate border-spacing-1 text-sm">
                    <caption className="sr-only">Horários por dia da semana</caption>
                    <thead>
                      <tr>
                        <th scope="col" className="w-9"><span className="sr-only">Hora</span></th>
                        {grid.data.days.map((d) => <th scope="col" key={d.weekday} className="pb-1 text-xs font-medium text-ink-3">{WEEKDAYS_SHORT[d.weekday]}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {[...new Set(grid.data.days.flatMap((d) => d.hours.map((h) => h.hour)))].sort((a, b) => a - b).map((hour) => (
                        <tr key={hour}>
                          <th scope="row" className="text-right text-xs font-normal text-ink-3 tabular-nums">{hour}h</th>
                          {grid.data.days.map((d) => {
                            const cell = d.hours.find((h) => h.hour === hour);
                            if (!cell) return <td key={d.weekday} />;
                            const chosen = picks.some((p) => p.weekday === d.weekday && p.hour === hour);
                            const none = cell.level === "nenhuma";
                            return (
                              <td key={d.weekday}>
                                <button type="button" disabled={none} aria-pressed={chosen}
                                  aria-label={`${WEEKDAYS[d.weekday]}, ${hour} horas${cell.peak ? ", horário concorrido" : ""}${none ? ", sem vagas" : ""}`}
                                  onClick={() => toggle({ weekday: d.weekday, hour })}
                                  className={cx("relative flex h-11 w-full items-center justify-center rounded-lg transition-transform active:scale-95 disabled:cursor-not-allowed", chosen ? "bg-accent-fill font-semibold text-on-accent" : LEVEL[cell.level])}>
                                  {chosen ? "✓" : none ? "–" : ""}
                                  {cell.peak && !chosen && !none && <Flame strokeWidth={1.5} className="size-3 text-warn" aria-hidden />}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="flex items-center gap-1.5 text-sm text-ink-3"><Flame strokeWidth={1.5} className="size-3.5 text-warn" />Horários mais concorridos (7h–9h e 17h–20h)</p>
                {peakChosen && !!suggestion.length && (
                  <p className="text-sm text-ink-2">Dica: às {suggestion.map((h) => `${h}h`).join(", ")} costuma ser mais tranquilo.</p>
                )}
                <Button variant="brand" disabled={picks.length !== needed} onClick={() => setStep(4)} className="w-full">
                  {picks.length === needed ? "Revisar" : `Escolha mais ${needed - picks.length}`}
                </Button>
              </>
            )}
          </div>
        )}

        {step === 4 && (
          <Card className="flex flex-col gap-4">
            <h2 className="font-display text-2xl">Confira antes de confirmar</h2>
            <dl className="flex flex-col gap-3">
              <div><dt className="text-sm text-ink-3">Unidade</dt><dd>{unit?.name}</dd></div>
              <div><dt className="text-sm text-ink-3">Fisioterapeuta</dt><dd>{unit?.physios.find((p) => p.id === physioId)?.name ?? "A clínica escolhe conforme a agenda"}</dd></div>
              <div><dt className="text-sm text-ink-3">{single ? "Horário" : "Horários semanais"}</dt>
                <dd>{[...picks].sort((a, b) => a.weekday - b.weekday).map((p) => `${WEEKDAYS[p.weekday]} às ${p.hour}h`).join(" e ")}</dd></div>
              <div><dt className="text-sm text-ink-3">Plano</dt><dd>{single ? "1 sessão avulsa" : "10 sessões"}, evitando feriados e conflitos</dd></div>
              {pays && <div><dt className="text-sm text-ink-3">Total via PIX</dt><dd className="font-display text-3xl tabular-nums">{total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</dd></div>}
            </dl>
            <Button variant="brand" loading={book.isPending} onClick={() => book.mutate()} className="w-full">{book.isPending ? "Reservando…" : pays ? "Confirmar e pagar com PIX" : "Confirmar agendamento"}</Button>
          </Card>
        )}
      </div>
    </div>
    {/* Resumo ao lado no desktop; no celular vem depois, e some na revisão, que já é o resumo */}
    {!patientId && (
      <aside aria-label="Resumo do agendamento" className={cx("card flex flex-col gap-3 p-5 lg:sticky lg:top-6", step === 4 && "max-lg:hidden")}>
        <h2 className="font-semibold">Resumo</h2>
        <ul className="flex flex-col gap-3">
          {summary.map((r) => (
            <li key={r.label} className="flex items-center gap-3">
              <Tile tone={r.tone}>{r.icon}</Tile>
              <span className="min-w-0"><span className="block text-xs text-ink-3">{r.label}</span><span className="block truncate text-sm font-medium">{r.value}</span></span>
            </li>
          ))}
        </ul>
        <div className="mt-1 flex items-center gap-3 rounded-2xl bg-accent-soft p-3">
          <Tile tone="ok"><Receipt /></Tile>
          {info.data ? (
            <span><span className="block text-xs text-ink-2">{pays ? "Total via PIX" : "Cobertura"}</span>
              <span className="block font-display text-2xl tabular-nums">{pays ? brl(total) : info.data.type === "CONVENIO" ? "Convênio" : "–"}</span></span>
          ) : <Skeleton className="h-10 w-32" />}
        </div>
        {pays && !single && <p className="text-xs text-ink-3">{brl(info.data!.priceCents / 100)} por sessão</p>}
      </aside>
    )}
    </div>
  );
}
