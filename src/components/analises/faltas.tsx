"use client";

import { useQuery } from "@tanstack/react-query";
import { Armchair, CalendarCheck, ClipboardList, Hourglass, LogOut, Repeat, ShieldCheck, UserX, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { Bars, Columns } from "@/components/charts";
import { useUnits } from "@/components/patient-form";
import { ErrorState, ListSkeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { brl } from "@/lib/labels";
import type { Tone } from "@/lib/labels";
import { DAY } from "@/lib/time";
import type { dashboard } from "@/server/services/metrics";
import { ExportCard } from "../export-png";
import { CardTitle, Figure, type Filters } from "./shared";

type Data = Awaited<ReturnType<typeof dashboard>>;
const pctN = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

export const dashboardQs = (dias: number, unitId: string, now: number) =>
  `from=${new Date(now - dias * DAY).toISOString()}&to=${new Date(now).toISOString()}${unitId ? `&unitId=${unitId}` : ""}`;

/** A tela de métricas de faltas de antes, inteira, com "Baixar PNG" em cada cartão. */
export function FaltasTab({ f, now }: { f: Filters; now: number }) {
  const { data: units } = useUnits();
  const qs = dashboardQs(f.dias, f.unitId, now);
  const { data: d, isLoading, isPlaceholderData, error, refetch } = useQuery({ queryKey: ["dashboard", f.dias, f.unitId], queryFn: () => api<Data>(`/admin/dashboard?${qs}`), staleTime: 300_000 });
  const filt = { unidade: f.unidade, periodo: f.periodo };

  if (isLoading) return <ListSkeleton rows={5} />;
  if (error || !d) return <ErrorState error={error} retry={refetch} />;

  const stat = (item: string, icon: ReactNode, tone: Tone, label: string, value: string, hint?: string) => (
    <ExportCard key={item} tone={tone} className="p-4 sm:p-5" spec={() => ({ item, title: label, filters: filt, body: { kind: "stats", items: [{ label, value, hint }] } })}>
      <Figure icon={icon} tone={tone} label={label} value={value} hint={hint} />
    </ExportCard>
  );
  const unitRows = d.byUnit.map((u) => ({ ...u, key: units?.find((x) => x.code === u.key)?.name ?? u.key }));
  const typeRows = d.byType.map((t) => ({ ...t, key: t.key === "CONVENIO" ? "Convênio" : "Particular" }));
  const barsSpec = (item: string, title: string, rows: { key: string; rate: number }[]) => () => ({
    item, title, filters: filt, body: { kind: "bars" as const, rows: rows.map((r) => ({ label: r.key, value: r.rate, display: pctN(r.rate) })) },
  });

  return (
    <div className={`flex flex-col gap-4 transition-opacity ${isPlaceholderData ? "opacity-60" : ""}`}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 2xl:grid-cols-8">
        {stat("taxa-de-faltas", <UserX />, "danger", "Taxa de faltas", pctN(d.noShowRate), `${d.totals.faltas} faltas`)}
        {stat("abandono", <LogOut />, "warn", "Abandono antes da 10ª", pctN(d.abandonRate))}
        {stat("taxa-de-confirmacao", <CalendarCheck />, "info", "Taxa de confirmação", pctN(d.confirmationRate))}
        {stat("receita-recuperada", <Wallet />, "ok", "Receita recuperada", brl(d.recoveredRevenue), `contra ${d.rules.baselineNoShowPct}% de referência`)}
        {stat("renovacao-convenio", <ShieldCheck />, "accent", "Renovação de convênio", `${d.avgRenewalDays.toLocaleString("pt-BR")} dias`, "tempo médio")}
        {stat("trocas-aprovadas", <Repeat />, "info", "Trocas aprovadas", `${d.reschedule.approved}/${d.reschedule.total}`, `${d.reschedule.rejected} recusadas · ${d.reschedule.avgResponseHours.toLocaleString("pt-BR")}h`)}
        {stat("lista-de-espera", <Hourglass />, "warn", "Lista de espera", `${d.waitlist.accepted}/${d.waitlist.offered}`, `aceitas · ${d.waitlist.active} na fila`)}
        {stat("ocupacao", <Armchair />, "accent", "Ocupação das cadeiras", pctN(d.occupancy))}
      </div>

      <div className="grid items-stretch gap-4 xl:grid-cols-3">
        <ExportCard className="xl:col-span-2" spec={() => ({
          item: "faltas-por-numero-da-sessao", title: "Faltas por número da sessão", filters: filt,
          body: { kind: "columns", suffix: "%", series: ["Convênio", "Particular"], rows: d.bySessionNumber.map((r) => ({ label: r.key, values: [r.convenio, r.particular] })) },
          note: "A 6ª sessão é quando o convênio precisa de renovação.",
        })}>
          <CardTitle hint="A 6ª sessão é quando o convênio precisa de renovação.">Faltas por número da sessão</CardTitle>
          <Columns head="Sessão" highlight="6" rows={d.bySessionNumber}
            series={[{ key: "convenio", label: "Convênio", color: "var(--chart-1)" }, { key: "particular", label: "Particular", color: "var(--chart-2)" }]} />
        </ExportCard>
        <div className="grid gap-4">
          <ExportCard spec={barsSpec("faltas-por-unidade", "Faltas por unidade", unitRows)}><CardTitle>Por unidade</CardTitle><Bars label="Faltas por unidade" rows={unitRows} /></ExportCard>
          <ExportCard spec={barsSpec("faltas-por-tipo", "Faltas por tipo de paciente", typeRows)}><CardTitle>Por tipo de paciente</CardTitle><Bars label="Faltas por tipo" rows={typeRows} /></ExportCard>
        </div>
      </div>
      <ExportCard spec={barsSpec("faltas-por-faixa-de-horario", "Faltas por faixa de horário", d.byHourBand)}><CardTitle>Por faixa de horário</CardTitle><Bars label="Faltas por faixa" rows={d.byHourBand} /></ExportCard>

      <ExportCard spec={() => ({
        item: "registro-padronizado", title: "Registro padronizado", filters: filt,
        body: { kind: "stats", items: [["Faltas", d.totals.faltas], ["Desmarcações", d.totals.desmarcacoes], ["Desmarcações tardias", d.totals.tardias], ["Reagendamentos", d.totals.reagendamentos], ["Atrasos", d.totals.atrasos]].map(([label, v]) => ({ label: String(label), value: String(v) })) },
      })}>
        <CardTitle icon={<ClipboardList />} tone="info">Registro padronizado</CardTitle>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {[["Faltas", d.totals.faltas], ["Desmarcações", d.totals.desmarcacoes], ["Desmarcações tardias", d.totals.tardias], ["Reagendamentos", d.totals.reagendamentos], ["Atrasos", d.totals.atrasos]].map(([k, v]) => (
            <div key={k}><p className="text-sm text-ink-2">{k}</p><p className="font-display text-3xl tabular-nums">{v}</p></div>
          ))}
        </div>
      </ExportCard>
    </div>
  );
}
