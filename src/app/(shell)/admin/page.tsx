"use client";

import { Download } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, ViewTransition } from "react";
import { dashboardQs, FaltasTab } from "@/components/analises/faltas";
import { Greeting } from "@/components/motion";
import { FinanceSkeleton } from "@/components/analises/financeiro";
import type { Filters } from "@/components/analises/shared";
import { useUnits } from "@/components/patient-form";
import { ListSkeleton, PageTitle, Segmented, SlidingTabs } from "@/components/ui";

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
      <Greeting context="saudacao.admin" vars={{ periodo: f.periodo }} className="mb-5" />
      <PageTitle eyebrow="Administração" title="Análises" action={
        aba === "faltas" && <a href={`/api/admin/export.csv?${dashboardQs(f.dias, unit, now)}`} className="btn btn-ghost"><Download strokeWidth={1.5} className="size-4" />CSV</a>
      } />
      {/* Abas e filtros fixos no topo; valem para as três abas */}
      <div className="sticky top-14 z-20 -mx-4 mb-5 flex flex-col gap-3 border-b border-line bg-bg px-4 pt-1 pb-3 sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-8 lg:px-8">
        <SlidingTabs label="Análises" tabs={TABS} value={aba} onChange={(id) => router.replace(`/admin?aba=${id}`, { scroll: false })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Segmented label="Período do histórico" value={days} onChange={setDays} options={PERIODS} />
          <Segmented label="Unidade" value={unit} onChange={setUnit} options={[{ value: "", label: "Todas" }, ...(units ?? []).map((u) => ({ value: u.id, label: u.name }))]} />
        </div>
      </div>
      {/* Altura reservada: a aba nova não faz a página saltar enquanto carrega. A troca é uma View Transition
          (o conteúdo antigo sai em 120 ms, o novo entra com fade, subida e desfoque curto) */}
      <div role="tabpanel" aria-label={TABS.find((t) => t.id === aba)!.label} className="min-h-[70vh]">
        <ViewTransition key={aba} enter="tab-in" exit="tab-out" default="none">
          <div>
            {aba === "faltas" && <FaltasTab f={f} now={now} />}
            {aba === "financeiro" && <FinanceiroTab f={f} />}
            {aba === "previsoes" && <PrevisoesTab f={f} />}
          </div>
        </ViewTransition>
      </div>
    </>
  );
}

export default function Page() {
  return <Suspense fallback={<ListSkeleton rows={5} />}><Analises /></Suspense>;
}
