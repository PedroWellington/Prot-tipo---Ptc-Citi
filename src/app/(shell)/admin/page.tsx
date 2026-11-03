"use client";

import { Download } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { dashboardQs, FaltasTab } from "@/components/analises/faltas";
import { FinanceSkeleton } from "@/components/analises/financeiro";
import type { Filters } from "@/components/analises/shared";
import { useUnits } from "@/components/patient-form";
import { cx, ListSkeleton, PageTitle, Segmented } from "@/components/ui";

// Abas pesadas só baixam quando abertas
const FinanceiroTab = dynamic(() => import("@/components/analises/financeiro").then((m) => m.FinanceiroTab), { loading: () => <FinanceSkeleton /> });
const PrevisoesTab = dynamic(() => import("@/components/analises/previsoes").then((m) => m.PrevisoesTab), { loading: () => <ListSkeleton rows={4} /> });

const PERIODS = [{ value: "30", label: "30 dias" }, { value: "90", label: "90 dias" }, { value: "180", label: "6 meses" }];
const TABS = [{ id: "faltas", label: "Faltas" }, { id: "financeiro", label: "Financeiro" }, { id: "previsoes", label: "Previsões" }] as const;
type Tab = (typeof TABS)[number]["id"];

function Analises() {
  const params = useSearchParams();
  const router = useRouter();
  const aba: Tab = TABS.some((t) => t.id === params.get("aba")) ? (params.get("aba") as Tab) : "faltas";
  const [days, setDays] = useState("180");
  const [unit, setUnit] = useState("");
  const { data: units } = useUnits();
  // Arredondado ao minuto: o servidor e o navegador montam o mesmo link do CSV (sem aviso de hidratação)
  const [now] = useState(() => Math.floor(Date.now() / 60_000) * 60_000);
  const f: Filters = {
    unitId: unit, unidade: units?.find((u) => u.id === unit)?.name ?? "Todas", dias: Number(days),
    periodo: PERIODS.find((p) => p.value === days)!.label,
  };

  return (
    <>
      <PageTitle eyebrow="Administração" title="Análises" action={
        aba === "faltas" && <a href={`/api/admin/export.csv?${dashboardQs(f.dias, unit, now)}`} className="btn btn-ghost"><Download strokeWidth={1.5} className="size-4" />CSV</a>
      } />
      {/* Abas e filtros fixos no topo; valem para as três abas */}
      <div className="sticky top-14 z-20 -mx-4 mb-5 flex flex-col gap-3 border-b border-line bg-bg px-4 pt-1 pb-3 sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-8 lg:px-8">
        <div role="tablist" aria-label="Análises" className="flex gap-1 rounded-full bg-surface-2 p-1">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={aba === t.id} onClick={() => router.replace(`/admin?aba=${t.id}`, { scroll: false })}
              className={cx("min-h-11 flex-1 rounded-full px-3 text-sm font-semibold whitespace-nowrap transition-opacity", aba === t.id ? "bg-accent-fill text-on-accent" : "text-ink-2")}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Segmented label="Período do histórico" value={days} onChange={setDays} options={PERIODS} />
          <Segmented label="Unidade" value={unit} onChange={setUnit} options={[{ value: "", label: "Todas" }, ...(units ?? []).map((u) => ({ value: u.id, label: u.name }))]} />
        </div>
      </div>
      <div role="tabpanel" aria-label={TABS.find((t) => t.id === aba)!.label}>
        {aba === "faltas" && <FaltasTab f={f} now={now} />}
        {aba === "financeiro" && <FinanceiroTab f={f} />}
        {aba === "previsoes" && <PrevisoesTab f={f} />}
      </div>
    </>
  );
}

export default function Page() {
  return <Suspense fallback={<ListSkeleton rows={5} />}><Analises /></Suspense>;
}
