"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarRange, ChartLine, CircleDollarSign, Lightbulb, ListOrdered, PiggyBank, TrendingDown, TrendingUp, Users } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import { simulateLoss } from "@/lib/previsao";
import { fmtTime, fmtWeekShort } from "@/lib/time";
import type { financeiro } from "@/server/services/analytics";
import { ExportCard } from "../export-png";
import { ErrorState, Skeleton } from "../ui";
import { barsBody, brl, CardTitle, Disclaimer, Figure, HBars, pct, RevenueChart, Seal, type Filters } from "./shared";

type Data = Awaited<ReturnType<typeof financeiro>>;

const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const monthName = (ym: string) => new Date(`${ym}-15T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

export function useFinanceiro(f: Filters, mes: string) {
  return useQuery({
    queryKey: ["analytics-fin", mes, f.unitId, f.dias],
    queryFn: () => api<Data>(`/analytics/financeiro?mes=${mes}&dias=${f.dias}${f.unitId ? `&unitId=${f.unitId}` : ""}`),
    staleTime: 300_000,
  });
}

export function FinanceSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5" role="status" aria-label="Carregando previsão financeira">
      {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-40 rounded-[20px]" />)}
      <Skeleton className="h-72 rounded-[20px] md:col-span-2 xl:col-span-5" />
    </div>
  );
}

/** Cartões de topo; a recepção vê só estes, como resumo. */
export function FinanceCards({ d, f }: { d: Data; f: Filters }) {
  const c = d.cards;
  const periodo = d.month;
  const card = (item: string, title: string, label: string, value: string, hint: string) => () => ({
    item, title, filters: { unidade: f.unidade, periodo }, body: { kind: "stats" as const, items: [{ label, value, hint }] },
  });
  const range = (r: { p80: [number, number] }) => `80%: ${brl(r.p80[0])} a ${brl(r.p80[1])}`;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <ExportCard className="kpi" spec={card("receita-realizada", "Receita realizada", "Até hoje", brl(c.realized), `${c.realizedCount} sessões realizadas`)}>
        <Figure icon={<CircleDollarSign />} tone="ok" label="Receita realizada até hoje" value={brl(c.realized)} hint={`${c.realizedCount} sessões realizadas`} />
      </ExportCard>
      <ExportCard className="kpi" spec={card("receita-prevista", "Receita prevista no fim do mês", "Esperada", brl(c.revenue.expected), range(c.revenue))}>
        <Figure icon={<TrendingUp />} tone="info" label="Receita prevista no fim do mês" value={brl(c.revenue.expected)} hint={range(c.revenue)} />
      </ExportCard>
      <ExportCard className="kpi" spec={card("perda-prevista", "Perda prevista no mês", "Esperada", brl(c.loss.expected), range(c.loss))}>
        <Figure icon={<TrendingDown />} tone="danger" label="Perda prevista" value={brl(c.loss.expected)} hint={range(c.loss)} />
      </ExportCard>
      <ExportCard className="kpi" spec={card("perda-ocorrida", "Perda já ocorrida", "Faltas e desmarcações tardias", brl(c.pastLoss), "no mês até agora")}>
        <Figure icon={<PiggyBank />} tone="warn" label="Perda já ocorrida" value={brl(c.pastLoss)} hint="faltas e desmarcações tardias" />
      </ExportCard>
      <ExportCard className="kpi" spec={card("comparecimento-previsto", "Comparecimento previsto", "Sessões ainda agendadas", c.attendance === null ? "–" : pct(c.attendance), `${c.futureCount} sessões`)}>
        <Figure icon={<Users />} tone="accent" label="Comparecimento previsto" value={c.attendance === null ? "–" : pct(c.attendance)} hint={`${c.futureCount} sessões ainda agendadas`} />
      </ExportCard>
    </div>
  );
}

function Simulator({ d }: { d: Data }) {
  const [reduce6pp, setR6] = useState(15);
  const [remindersPct, setRem] = useState(20);
  const [saturdayPct, setSat] = useState(0);
  const s = simulateLoss(d.sim, { reduce6pp, remindersPct, saturdayPct });
  const slider = (label: string, hint: string, value: number, set: (n: number) => void, max: number, unit: string) => (
    <label className="flex flex-col gap-1">
      <span className="flex justify-between gap-2 text-sm"><span className="font-medium">{label}</span><span className="font-semibold tabular-nums">{value}{unit}</span></span>
      <input type="range" min={0} max={max} step={1} value={value} onChange={(e) => set(Number(e.target.value))} className="h-11 w-full accent-[var(--accent)]" />
      <span className="text-xs text-ink-3">{hint}</span>
    </label>
  );
  return (
    <section className="card p-5 sm:p-6">
      <CardTitle icon={<Lightbulb />} tone="warn" hint="Quanto a perda das sessões ainda agendadas cairia com as propostas do protótipo.">Simulador “e se”</CardTitle>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex flex-col gap-4">
          {slider("Renovação antecipada", "Reduz a falta da 6ª sessão de convênio (pontos percentuais)", reduce6pp, setR6, 30, " p.p.")}
          {slider("Confirmação interativa", "Lembretes com botões cortam esta parte das faltas não confirmadas", remindersPct, setRem, 50, "%")}
          {slider("Abrir sábado", "Parte das sessões de pico (7–9h e 17–20h) vai para sábado de manhã", saturdayPct, setSat, 50, "%")}
        </div>
        <div className="flex flex-col justify-center gap-2 rounded-2xl bg-surface-2 p-4">
          <p className="text-sm text-ink-2">Perda futura esperada</p>
          <p className="tabular-nums"><span className="text-ink-3 line-through">{brl(s.before)}</span> → <b className="font-display text-3xl">{brl(s.after)}</b></p>
          <p className="rounded-xl bg-ok-soft px-3 py-2 text-sm font-semibold text-ok">Economia de {brl(s.saved)} no mês</p>
        </div>
      </div>
    </section>
  );
}

export function FinanceiroTab({ f, simulator = true }: { f: Filters; simulator?: boolean }) {
  const [mes, setMes] = useState(thisMonth);
  const { data: d, isLoading, isPlaceholderData, error, refetch } = useFinanceiro(f, mes);
  const spec = (item: string, title: string, body: Parameters<typeof barsBody>[0]) => () => ({ item, title, filters: { unidade: f.unidade, periodo: mes }, body: barsBody(body) });
  const lossRows = (rows: Data["breakdowns"]["unidade"]) => rows.map((r) => ({ label: r.key, value: r.totalLoss, display: brl(r.totalLoss) }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <CalendarRange strokeWidth={1.6} className="size-5 text-accent" />
          <span className="sr-only">Mês</span>
          <input type="month" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} className="field min-h-11 w-auto capitalize" />
        </label>
        {d && <Seal months={Math.round(d.seal.historyDays / 30)} sessions={d.seal.sessions} />}
      </div>
      {isLoading && <FinanceSkeleton />}
      {error && <ErrorState error={error} retry={refetch} />}
      {d && (
        <div className={`flex flex-col gap-4 transition-opacity ${isPlaceholderData ? "opacity-60" : ""}`}>
          <FinanceCards d={d} f={f} />
          <ExportCard spec={() => ({
            item: "receita-acumulada", title: `Receita acumulada · ${monthName(mes)}`, filters: { unidade: f.unidade, periodo: mes },
            body: { kind: "line", money: true, points: d.daily.map((p) => ({ x: p.day, realized: p.realized, expected: p.expected, lo: p.lo, hi: p.hi })) },
            note: `Prevista: ${brl(d.cards.revenue.expected)} (80%: ${brl(d.cards.revenue.p80[0])} a ${brl(d.cards.revenue.p80[1])}; 90%: ${brl(d.cards.revenue.p90[0])} a ${brl(d.cards.revenue.p90[1])}).`,
          })}>
            <CardTitle icon={<ChartLine />} tone="info" hint={`Mediana ${brl(d.cards.revenue.median)} · 90%: ${brl(d.cards.revenue.p90[0])} a ${brl(d.cards.revenue.p90[1])}`}>Receita acumulada por dia</CardTitle>
            <RevenueChart points={d.daily} />
          </ExportCard>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {([["unidade", "Perda por unidade"], ["tipo", "Perda por tipo de paciente"], ["faixa", "Perda por faixa de horário"], ["sessao", "Perda por número da sessão"]] as const).map(([k, title]) => (
              <ExportCard key={k} spec={spec(`perda-por-${k}`, title, lossRows(d.breakdowns[k]))}>
                <CardTitle hint="Já ocorrida + prevista">{title}</CardTitle>
                <HBars label={title} rows={lossRows(d.breakdowns[k])} />
              </ExportCard>
            ))}
          </div>

          <ExportCard spec={() => ({
            item: "maiores-riscos-sessoes", title: "Sessões com maior valor em risco", filters: { unidade: f.unidade, periodo: mes },
            body: { kind: "table", columns: ["Sessão", "Unidade", "Chance de vir", "Em risco", "Ação"], rows: d.risks.map((r) => [`${fmtWeekShort(r.startsAt)} ${fmtTime(r.startsAt)} · ${r.number}ª`, r.unit, pct(r.p), brl(r.atRisk), r.action]) },
          })}>
            <CardTitle icon={<ListOrdered />} tone="danger" hint="Sessões futuras com menor chance de comparecimento">Maiores riscos</CardTitle>
            {!d.risks.length ? <p className="text-ink-2">Nenhuma sessão futura neste mês.</p> : (
              <ul className="divide-y divide-line">
                {d.risks.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-sm">
                    <span className="min-w-36 font-medium first-letter:uppercase">{fmtWeekShort(r.startsAt)} · {fmtTime(r.startsAt)}</span>
                    <span className="text-ink-2">{r.unit} · {r.type} · {r.number}ª sessão</span>
                    <span className="ml-auto flex items-center gap-3 tabular-nums"><span className="text-ink-3">vir: {pct(r.p)}</span><b className="font-semibold text-danger">{brl(r.atRisk)}</b></span>
                    <span className="w-full text-xs text-ink-3">Sugestão: {r.action}</span>
                  </li>
                ))}
              </ul>
            )}
          </ExportCard>

          {simulator && !d.past && <Simulator d={d} />}

          <section className="card flex flex-col gap-3 p-5 text-sm text-ink-2 sm:p-6">
            <h2 className="font-semibold text-ink">Como calculamos</h2>
            <p>Cada sessão agendada recebe uma chance de comparecimento: 1 menos a taxa de falta do seu grupo (tipo de paciente, número da sessão, faixa de horário e unidade) nos últimos {Math.round(d.seal.historyDays / 30)} meses. Grupos com menos de 30 sessões usam o grupo mais amplo (tipo + sessão, depois só o tipo), com suavização bayesiana para não confiar em amostras pequenas.</p>
            <p>Receita prevista = já realizada + soma de valor × chance das sessões agendadas. A faixa vem de 2.000 simulações. Sessões com pagamento pendente ou reserva vencida ficam de fora; as de convênio com renovação pendente usam a taxa da 6ª sessão. Valores: particular {brl(d.prices.particular)} e convênio {brl(d.prices.convenio)} (Parâmetros).</p>
            <Disclaimer />
          </section>
        </div>
      )}
    </div>
  );
}
