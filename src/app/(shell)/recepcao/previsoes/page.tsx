"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { FinanceCards, FinanceSkeleton, useFinanceiro } from "@/components/analises/financeiro";
import type { Filters } from "@/components/analises/shared";
import { useUnits } from "@/components/patient-form";
import { ErrorState, ListSkeleton, PageTitle, Segmented } from "@/components/ui";

const PrevisoesTab = dynamic(() => import("@/components/analises/previsoes").then((m) => m.PrevisoesTab), { loading: () => <ListSkeleton rows={4} /> });

const month = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };

/** Recepção: resumo financeiro do mês (sem simulador) e as previsões de falta para agir na semana. */
export default function Page() {
  const [unit, setUnit] = useState("");
  const { data: units } = useUnits();
  const f: Filters = { unitId: unit, unidade: units?.find((u) => u.id === unit)?.name ?? "Todas", dias: 180, periodo: "6 meses" };
  const fin = useFinanceiro(f, month());
  return (
    <>
      <PageTitle eyebrow="Recepção" title="Previsões" />
      <div className="mb-5 max-w-md"><Segmented label="Unidade" value={unit} onChange={setUnit} options={[{ value: "", label: "Todas" }, ...(units ?? []).map((u) => ({ value: u.id, label: u.name }))]} /></div>
      <section id="financeiro" aria-label="Resumo financeiro do mês" className="mb-6 scroll-mt-20">
        <h2 className="mb-3 font-semibold">Financeiro do mês</h2>
        {fin.isLoading && <FinanceSkeleton />}
        {fin.error && <ErrorState error={fin.error} retry={fin.refetch} />}
        {fin.data && <FinanceCards d={fin.data} f={f} />}
      </section>
      <PrevisoesTab f={f} />
    </>
  );
}
