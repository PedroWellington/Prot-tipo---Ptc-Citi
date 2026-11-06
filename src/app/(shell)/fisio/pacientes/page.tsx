"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { memo, useCallback, useMemo, useState, type MouseEvent } from "react";
import { TreatmentDetail } from "@/components/treatment-detail";
import { Badge, cx, Empty, ErrorState, ListSkeleton, PageTitle, SearchField, Stat } from "@/components/ui";
import { q, type PatientRow } from "@/lib/queries";

const PHASES = [
  { value: "todos", label: "Todos", test: () => true },
  { value: "inicio", label: "Início", test: (n: number) => n <= 2 },
  { value: "alivio", label: "Alívio", test: (n: number) => n >= 3 && n <= 4 },
  { value: "critica", label: "Fase crítica", test: (n: number) => n >= 5 && n <= 6 },
  { value: "final", label: "Finalizando", test: (n: number) => n >= 7 },
];

const Row = memo(function Row({ p, selected, onPick }: { p: PatientRow; selected: boolean; onPick: (e: MouseEvent, id: string) => void }) {
  const t = p.treatments[0];
  return (
    <li>
      <Link href={`/fisio/pacientes/${t.id}`} prefetch={false} onClick={(e) => onPick(e, t.id)} aria-current={selected ? "true" : undefined}
        className={cx("row-hover block px-4 py-3", selected && "bg-accent-soft")}>
        <span className="flex items-center justify-between gap-3">
          <span className="truncate font-medium">{p.user.name}</span>
          <Badge tone={t.status === "ATIVO" ? "accent" : "neutral"}>{t.completedSessions}/{t.totalSessions}</Badge>
        </span>
        <span className="mt-2 block h-2 overflow-hidden rounded-full bg-surface-2">
          <span className="block h-full origin-left rounded-full bg-accent" style={{ transform: `scaleX(${t.completedSessions / t.totalSessions})` }} />
        </span>
      </Link>
    </li>
  );
});

export default function Page() {
  const [search, setSearch] = useState("");
  const [phase, setPhase] = useState("todos");
  const [picked, setPicked] = useState<string | null>(null);
  const { data, isLoading, error, refetch } = useQuery(q.physioPatients(search));

  const all = useMemo(() => (data ?? []).filter((p) => p.treatments[0]), [data]);
  const active = all.filter((p) => p.treatments[0].status === "ATIVO");
  const critical = active.filter((p) => { const n = p.treatments[0].completedSessions; return n >= 5 && n <= 6; }).length;
  const ending = active.filter((p) => p.treatments[0].completedSessions >= 7).length;

  const rows = useMemo(() => {
    const test = PHASES.find((f) => f.value === phase)!.test;
    return all.filter((p) => test(p.treatments[0].completedSessions));
  }, [all, phase]);

  // No desktop abre ao lado; no celular segue o link para a tela de detalhe
  const onPick = useCallback((e: MouseEvent, id: string) => {
    if (matchMedia("(min-width: 1024px)").matches) {
      e.preventDefault();
      setPicked(id);
    }
  }, []);
  // Só abre com clique: abrir prontuário grava acesso na auditoria
  const selected = picked;

  return (
    <>
      <PageTitle eyebrow="Fisioterapeuta" title="Meus pacientes" />
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat label="Em tratamento" value={active.length} />
        <Stat label="Fase crítica" value={critical} />
        <Stat label="Finalizando" value={ending} />
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-8">
          <SearchField onSearch={setSearch} />
          <div role="radiogroup" aria-label="Filtrar por fase" className="flex flex-wrap gap-1.5">
            {PHASES.map((f) => (
              <button key={f.value} type="button" role="radio" aria-checked={phase === f.value} onClick={() => setPhase(f.value)}
                className={cx("min-h-9 rounded-full px-3 text-sm font-semibold", phase === f.value ? "bg-accent-fill text-on-accent" : "bg-surface-2 text-ink-2")}>{f.label}</button>
            ))}
          </div>
          {isLoading && <ListSkeleton />}
          {error && <ErrorState error={error} retry={refetch} />}
          {data && !rows.length && <div className="card"><Empty title="Ninguém encontrado" /></div>}
          {!!rows.length && (
            <ul className="stagger card divide-y divide-line overflow-hidden lg:max-h-[calc(100dvh-300px)] lg:overflow-y-auto">
              {rows.map((p) => <Row key={p.id} p={p} selected={p.treatments[0].id === selected} onPick={onPick} />)}
            </ul>
          )}
        </div>
        <div className="hidden min-w-0 lg:block">
          {selected ? <TreatmentDetail key={selected} id={selected} /> : <div className="card"><Empty title="Selecione um paciente" body="Progresso, sessões e ações aparecem aqui." /></div>}
        </div>
      </div>
    </>
  );
}
