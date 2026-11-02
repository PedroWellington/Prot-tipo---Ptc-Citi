"use client";

import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useState } from "react";
import { Bars, Columns } from "@/components/charts";
import { useUnits } from "@/components/patient-form";
import { Card, ErrorState, ListSkeleton, PageTitle, Segmented, Stat } from "@/components/ui";
import { api } from "@/lib/api";
import { brl } from "@/lib/labels";
import { DAY } from "@/lib/time";
import type { dashboard } from "@/server/services/metrics";

type Data = Awaited<ReturnType<typeof dashboard>>;
const PERIODS = [{ value: "30", label: "30 dias" }, { value: "90", label: "90 dias" }, { value: "180", label: "6 meses" }];
const pct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

export default function Page() {
  const [days, setDays] = useState("180");
  const [unit, setUnit] = useState("");
  const { data: units } = useUnits();
  const [now] = useState(() => Date.now());
  const qs = `from=${new Date(now - Number(days) * DAY).toISOString()}&to=${new Date(now).toISOString()}${unit ? `&unitId=${unit}` : ""}`;
  const { data: d, isLoading, isPlaceholderData, error, refetch } = useQuery({ queryKey: ["dashboard", days, unit], queryFn: () => api<Data>(`/admin/dashboard?${qs}`), staleTime: 300_000 });

  return (
    <>
      <PageTitle eyebrow="Administração" title="Métricas" action={
        <a href={`/api/admin/export.csv?${qs}`} className="btn btn-ghost"><Download strokeWidth={1.5} className="size-4" />CSV</a>
      } />
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <Segmented label="Período" value={days} onChange={setDays} options={PERIODS} />
        <Segmented label="Unidade" value={unit} onChange={setUnit} options={[{ value: "", label: "Todas" }, ...(units ?? []).map((u) => ({ value: u.id, label: u.name }))]} />
      </div>
      {isLoading && <ListSkeleton rows={5} />}
      {error && <ErrorState error={error} retry={refetch} />}
      {d && (
        <div className={`flex flex-col gap-4 ${isPlaceholderData ? "opacity-60" : ""}`}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 2xl:grid-cols-8">
            <Stat label="Taxa de faltas" value={pct(d.noShowRate)} hint={`${d.totals.faltas} faltas`} />
            <Stat label="Abandono antes da 10ª" value={pct(d.abandonRate)} />
            <Stat label="Taxa de confirmação" value={pct(d.confirmationRate)} />
            <Stat label="Receita recuperada" value={brl(d.recoveredRevenue)} hint={`contra ${d.rules.baselineNoShowPct}% de referência`} />
            <Stat label="Renovação de convênio" value={`${d.avgRenewalDays.toLocaleString("pt-BR")} dias`} hint="tempo médio" />
            <Stat label="Trocas aprovadas" value={`${d.reschedule.approved}/${d.reschedule.total}`} hint={`${d.reschedule.rejected} recusadas · ${d.reschedule.avgResponseHours.toLocaleString("pt-BR")}h`} />
            <Stat label="Lista de espera" value={`${d.waitlist.accepted}/${d.waitlist.offered}`} hint={`aceitas · ${d.waitlist.active} na fila`} />
            <Stat label="Ocupação das cadeiras" value={pct(d.occupancy)} />
          </div>

          <div className="grid items-stretch gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <h2 className="font-semibold">Faltas por número da sessão</h2>
            <p className="mb-2 text-sm text-ink-3">A 6ª sessão é quando o convênio precisa de renovação.</p>
            <Columns head="Sessão" highlight="6" rows={d.bySessionNumber}
              series={[{ key: "convenio", label: "Convênio", color: "var(--chart-1)" }, { key: "particular", label: "Particular", color: "var(--chart-2)" }]} />
          </Card>

          <div className="grid gap-4">
            <Card><h2 className="mb-3 font-semibold">Por unidade</h2><Bars label="Faltas por unidade" rows={d.byUnit.map((u) => ({ ...u, key: units?.find((x) => x.code === u.key)?.name ?? u.key }))} /></Card>
            <Card><h2 className="mb-3 font-semibold">Por tipo de paciente</h2><Bars label="Faltas por tipo" rows={d.byType.map((t) => ({ ...t, key: t.key === "CONVENIO" ? "Convênio" : "Particular" }))} /></Card>
            </div>
          </div>
          <Card><h2 className="mb-3 font-semibold">Por faixa de horário</h2><Bars label="Faltas por faixa" rows={d.byHourBand} /></Card>

          <Card>
            <h2 className="mb-3 font-semibold">Registro padronizado</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {[["Faltas", d.totals.faltas], ["Desmarcações", d.totals.desmarcacoes], ["Desmarcações tardias", d.totals.tardias], ["Reagendamentos", d.totals.reagendamentos], ["Atrasos", d.totals.atrasos]].map(([k, v]) => (
                <div key={k}><p className="text-sm text-ink-2">{k}</p><p className="font-display text-3xl tabular-nums">{v}</p></div>
              ))}
            </div>
          </Card>

        </div>
      )}
    </>
  );
}
