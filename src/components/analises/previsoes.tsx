"use client";

import { useQuery } from "@tanstack/react-query";
import { BellRing, CalendarDays, Clock, FlaskConical, ListOrdered, MapPin, Target, UserRoundSearch } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { fold } from "@/lib/assistente";
import { fmtTime, fmtWeekShort } from "@/lib/time";
import type { backtest, previsoes } from "@/server/services/analytics";
import { ExportButton, ExportCard } from "../export-png";
import { useAction } from "../providers";
import { Badge, Button, ErrorState, SearchField, Segmented, Skeleton } from "../ui";
import { barsBody, CardTitle, Disclaimer, Figure, HBars, num, pct, Seal, type Filters } from "./shared";

type Data = Awaited<ReturnType<typeof previsoes>>;
type Bt = Awaited<ReturnType<typeof backtest>>;

const LEVEL = { alto: { label: "Risco alto", tone: "danger" }, medio: { label: "Risco médio", tone: "warn" }, baixo: { label: "Risco baixo", tone: "ok" } } as const;

function Backtest() {
  const { data: b, isLoading, error } = useQuery({ queryKey: ["analytics-bt"], queryFn: () => api<Bt>("/analytics/backtest"), staleTime: 600_000 });
  const fmt = (n: number | null, digits = 0) => (n === null ? "–" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: digits })}%`);
  return (
    <ExportCard spec={() => ({
      item: "backtest", title: "Backtest: previsto x realizado", filters: { unidade: "Todas", periodo: "historico" },
      body: { kind: "table", columns: ["Período", "Sessões", "Faltas previstas", "Faltas reais"], rows: (b?.periods ?? []).map((p) => [p.label, String(p.sessions), num(p.predictedMisses), String(p.actualMisses)]) },
      extra: b ? { kind: "stats", items: [
        { label: "MAPE faltas/semana", value: fmt(b.mape.faltasSemana) }, { label: "MAPE faltas/mês", value: fmt(b.mape.faltasMes) }, { label: "MAPE receita/mês", value: fmt(b.mape.receitaMes) },
        { label: "AUC por paciente", value: b.patient.auc === null ? "–" : b.patient.auc.toFixed(2) }, { label: "Acurácia (corte 35%)", value: fmt(b.patient.accuracy === null ? null : b.patient.accuracy * 100) },
        { label: "Acurácia de \"ninguém falta\"", value: fmt(b.patient.baselineAccuracy === null ? null : b.patient.baselineAccuracy * 100) },
      ] } : undefined,
      note: "Histórico sintético da demonstração: as faltas foram sorteadas por grupo, sem padrão individual por paciente.",
    })}>
      <CardTitle icon={<FlaskConical />} tone="info" hint="O modelo é treinado só com o que existia antes de cada período e comparado com o que aconteceu.">Backtest</CardTitle>
      {isLoading && <Skeleton className="h-40 w-full" />}
      {error && <ErrorState error={error} />}
      {b && (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 xl:grid-cols-6">
            {[
              ["Erro médio faltas/semana", fmt(b.mape.faltasSemana)], ["Erro médio faltas/mês", fmt(b.mape.faltasMes)],
              ["Erro médio receita/semana", fmt(b.mape.receitaSemana)], ["Erro médio receita/mês", fmt(b.mape.receitaMes)],
              ["AUC por paciente", b.patient.auc === null ? "–" : `${b.patient.auc.toFixed(2)} (grupo: ${b.patient.aucSegmentOnly?.toFixed(2) ?? "–"})`],
              ["Acurácia (corte 35%)", `${fmt(b.patient.accuracy === null ? null : b.patient.accuracy * 100)} · base ${fmt(b.patient.baselineAccuracy === null ? null : b.patient.baselineAccuracy * 100)}`],
            ].map(([k, v]) => <div key={k} className="rounded-2xl bg-surface-2 p-3"><dt className="text-ink-3">{k}</dt><dd className="mt-1 font-semibold tabular-nums">{v}</dd></div>)}
          </dl>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm tabular-nums">
              <thead className="text-ink-3"><tr><th className="py-1 font-medium">Período</th><th className="font-medium">Sessões</th><th className="font-medium">Faltas previstas</th><th className="font-medium">Faltas reais</th><th className="font-medium">Receita prevista</th><th className="font-medium">Receita real</th></tr></thead>
              <tbody>{b.periods.map((p) => (
                <tr key={p.kind + p.label} className="border-t border-line">
                  <td className="py-1.5">{p.kind === "semana" ? `Semana ${p.label}` : p.label}</td><td>{p.sessions}</td><td>{num(p.predictedMisses)}</td><td>{p.actualMisses}</td>
                  <td>{p.predictedRevenue.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</td><td>{p.actualRevenue.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <Disclaimer>Histórico sintético: as faltas da demonstração foram sorteadas por grupo (tipo, sessão), sem padrão individual. Por isso o risco por paciente quase não supera a taxa do grupo (AUC perto de 0,5) e, com faltas raras, “ninguém falta” acerta mais que qualquer corte. Com dados reais, o histórico próprio do paciente costuma pesar mais.</Disclaimer>
        </div>
      )}
    </ExportCard>
  );
}

function Patients({ d, f, semana }: { d: Data; f: Filters; semana: string }) {
  const [search, setSearch] = useState("");
  const rows = useMemo(() => d.patients.filter((p) => !search || fold(p.name).includes(fold(search))), [d.patients, search]);
  const remind = useAction({ run: (sessionId: string) => api(`/desk/sessions/${sessionId}/remind`, { body: {} }), success: "Lembrete enviado", invalidate: [["whatsapp"]] });
  const spec = () => ({
    item: "pacientes-risco", title: "Risco de falta por paciente", filters: { unidade: f.unidade, periodo: semana === "proxima" ? "proxima-semana" : "semana-atual" },
    body: { kind: "table" as const, nameCol: 0, columns: ["Paciente", "Chance de faltar", "Fatores", "Ação"], rows: rows.slice(0, 15).map((p) => [p.name, pct(p.p), p.factors.slice(0, 2).join(", ") || "taxa do grupo", p.action]) },
    note: "Estimativas de comportamento de atendimento, não rótulos dos pacientes.",
  });
  return (
    <section className="export-card card relative p-5 sm:p-6">
      <ExportButton spec={spec} className="absolute top-3 right-3" />
      <CardTitle icon={<UserRoundSearch />} tone="danger" hint="Chance de faltar na próxima sessão: histórico do próprio paciente combinado com a taxa do grupo. Estimativa, nunca certeza.">Risco por paciente</CardTitle>
      <div className="mb-3"><SearchField onSearch={setSearch} placeholder="Buscar paciente" /></div>
      {!rows.length ? <p className="text-ink-2">Nenhum paciente com sessão neste período.</p> : (
        <ul className="divide-y divide-line">
          {rows.map((p) => (
            <li key={p.patientId} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:gap-4">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-medium">{p.name}<Badge tone={LEVEL[p.level].tone}>{LEVEL[p.level].label} · {pct(p.p)}</Badge></p>
                <p className="text-sm text-ink-2 first-letter:uppercase">{fmtWeekShort(p.startsAt)} às {fmtTime(p.startsAt)} · {p.unit} · {p.type}, {p.number}ª sessão</p>
                <p className="mt-1 text-sm text-ink-3">{p.factors.length ? p.factors.join(" · ") : "Sem fatores de alerta: vale a taxa do grupo"}</p>
                <p className="text-xs text-ink-3">Confiança {p.confidence} · {p.sample} sessões de histórico · grupo {pct(p.segmentRate)}</p>
              </div>
              <div className="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
                <span className="text-sm font-medium">{p.action}</span>
                {p.level !== "baixo" && <Button variant="line" className="min-h-10 text-sm" onClick={() => remind.mutate(p.sessionId)}><BellRing strokeWidth={1.6} className="size-4" />Enviar lembrete</Button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function PrevisoesTab({ f }: { f: Filters }) {
  const [semana, setSemana] = useState<"atual" | "proxima">("atual");
  const { data: d, isLoading, isPlaceholderData, error, refetch } = useQuery({
    queryKey: ["analytics-prev", f.unitId, semana, f.dias],
    queryFn: () => api<Data>(`/analytics/previsoes?semana=${semana}&dias=${f.dias}${f.unitId ? `&unitId=${f.unitId}` : ""}`),
    staleTime: 300_000,
  });
  const per = semana === "proxima" ? "proxima-semana" : "semana-atual";
  const stat = (item: string, title: string, label: string, value: string, hint: string, periodo = per) => () => ({ item, title, filters: { unidade: f.unidade, periodo }, body: { kind: "stats" as const, items: [{ label, value, hint }] } });
  const bars = (item: string, title: string, rows: { key: string; expected: number }[]) => () => ({ item, title, filters: { unidade: f.unidade, periodo: per }, body: barsBody(rows.map((r) => ({ label: r.key, value: r.expected, display: num(r.expected) }))) });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-full max-w-xs"><Segmented label="Semana" value={semana} onChange={setSemana} options={[{ value: "atual", label: "Esta semana" }, { value: "proxima", label: "Próxima" }]} /></div>
        {d && <Seal months={Math.round(d.seal.historyDays / 30)} sessions={d.seal.sessions} />}
      </div>
      {isLoading && <div className="grid gap-4 md:grid-cols-3" role="status" aria-label="Carregando previsões">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 rounded-[20px]" />)}</div>}
      {error && <ErrorState error={error} retry={refetch} />}
      {d && (
        <div className={`flex flex-col gap-4 transition-opacity ${isPlaceholderData ? "opacity-60" : ""}`}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <ExportCard className="band" spec={stat("faltas-previstas-semana", "Faltas previstas na semana", "Esperadas", num(d.week.expected), `80%: ${num(d.week.p80[0])} a ${num(d.week.p80[1])} · ${d.week.sessions} sessões`)}>
              <Figure icon={<CalendarDays />} tone="danger" label={semana === "proxima" ? "Faltas previstas na próxima semana" : "Faltas previstas até domingo"} value={num(d.week.expected)} hint={`80%: ${num(d.week.p80[0])} a ${num(d.week.p80[1])} · ${d.week.sessions} sessões`} />
            </ExportCard>
            <ExportCard className="band" spec={stat("faltas-previstas-mes", "Faltas previstas até o fim do mês", "Esperadas", num(d.month.expected), `80%: ${num(d.month.p80[0])} a ${num(d.month.p80[1])} · ${d.month.sessions} sessões`, "mes-atual")}>
              <Figure icon={<Target />} tone="warn" label="Faltas previstas até o fim do mês" value={num(d.month.expected)} hint={`80%: ${num(d.month.p80[0])} a ${num(d.month.p80[1])} · ${d.month.sessions} sessões`} />
            </ExportCard>
            <ExportCard className="band" spec={stat("taxa-falta-prevista", "Taxa de falta prevista", "Na semana", pct(d.week.rate, 1), `no mês: ${pct(d.month.rate, 1)}`)}>
              <Figure icon={<Clock />} tone="info" label="Taxa de falta prevista na semana" value={pct(d.week.rate, 1)} hint={`No mês: ${pct(d.month.rate, 1)}`} />
            </ExportCard>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <ExportCard spec={bars("faltas-previstas-por-unidade", "Faltas previstas por unidade", d.week.byUnit)}>
              <CardTitle icon={<MapPin />} tone="warn">Por unidade</CardTitle>
              <HBars label="Faltas previstas por unidade" rows={d.week.byUnit.map((g) => ({ label: g.key, value: g.expected, display: `${num(g.expected)} · ${pct(g.rate)}` }))} />
            </ExportCard>
            <ExportCard spec={bars("faltas-previstas-por-dia", "Faltas previstas por dia da semana", d.week.byWeekday)}>
              <CardTitle icon={<CalendarDays />} tone="info">Por dia da semana</CardTitle>
              <HBars label="Faltas previstas por dia" rows={d.week.byWeekday.map((g) => ({ label: g.key, value: g.expected, display: `${num(g.expected)} de ${g.sessions}` }))} />
            </ExportCard>
            <ExportCard spec={bars("faltas-previstas-por-horario", "Faltas previstas por faixa de horário", d.week.byBand)}>
              <CardTitle icon={<Clock />} tone="accent">Por faixa de horário</CardTitle>
              <HBars label="Faltas previstas por faixa" rows={d.week.byBand.map((g) => ({ label: g.key, value: g.expected, display: `${num(g.expected)} · ${pct(g.rate)}` }))} />
            </ExportCard>
          </div>
          <ExportCard spec={() => ({
            item: "sessoes-maior-risco", title: "Sessões com maior risco de falta", filters: { unidade: f.unidade, periodo: per },
            body: { kind: "table", columns: ["Sessão", "Unidade", "Grupo", "Risco"], rows: d.topSessions.map((s) => [`${fmtWeekShort(s.startsAt)} ${fmtTime(s.startsAt)}`, s.unit, `${s.type} · ${s.number}ª · ${s.band}`, pct(s.risk)]) },
          })}>
            <CardTitle icon={<ListOrdered />} tone="danger">Sessões com maior risco</CardTitle>
            <ul className="divide-y divide-line text-sm">
              {d.topSessions.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                  <span className="min-w-36 font-medium first-letter:uppercase">{fmtWeekShort(s.startsAt)} · {fmtTime(s.startsAt)}</span>
                  <span className="text-ink-2">{s.unit} · {s.type} · {s.number}ª sessão · {s.band}</span>
                  <span className="ml-auto font-semibold text-danger tabular-nums">{pct(s.risk)}</span>
                  <span className="w-full text-xs text-ink-3">Base: grupo {s.basis}, {s.n} sessões</span>
                </li>
              ))}
            </ul>
          </ExportCard>
          <Patients d={d} f={f} semana={semana} />
          <Backtest />
          <Disclaimer>Usamos só dados de comportamento do atendimento (faltas, desmarcações, atrasos, confirmações, trocas). Nada de idade, sexo, bairro, nome ou CPF. Dados fictícios de demonstração.</Disclaimer>
        </div>
      )}
    </div>
  );
}
