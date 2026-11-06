"use client";

import { useQuery } from "@tanstack/react-query";
import { DemoReset } from "@/components/demo-reset";
import { useAction } from "@/components/providers";
import { Button, Card, ErrorState, Input, ListSkeleton, PageTitle, Toggle } from "@/components/ui";
import { api } from "@/lib/api";
import { DEMO_MODE } from "@/lib/demo";
import { q } from "@/lib/queries";
import type { assistantStatus } from "@/server/assistant/engine";
import type { Settings } from "@/server/repositories/config";

/** Qual IA responde agora e o uso do dia. As chaves nunca saem do servidor. */
function AssistantCard() {
  const { data } = useQuery({ queryKey: ["assistente-status"], queryFn: () => api<Awaited<ReturnType<typeof assistantStatus>>>("/admin/assistente"), staleTime: 30_000 });
  return (
    <Card className="flex flex-col gap-2">
      <h2 className="font-semibold">Assistente</h2>
      {!data ? <p className="text-sm text-ink-3">Carregando…</p> : (
        <dl className="flex flex-col gap-1.5 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-ink-3">IA ativa</dt><dd className="text-right">{data.active ? `${data.active.label} (${data.active.model})` : "Modo básico"}</dd></div>
          {data.active?.fallbackModel && <div className="flex justify-between gap-3"><dt className="text-ink-3">Modelo menor</dt><dd className="text-right">{data.active.fallbackModel}</dd></div>}
          <div className="flex justify-between gap-3"><dt className="text-ink-3">IA reserva</dt><dd className="text-right">{data.reserve ? `${data.reserve.label} (${data.reserve.model})` : "Nenhuma"}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-ink-3">Sem IA</dt><dd>Modo básico</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-ink-3">Uso hoje</dt><dd className="tabular-nums">{data.usedToday} de {data.limit} perguntas</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-ink-3">Por pessoa</dt><dd className="tabular-nums">{data.perUserPerMinute}/min · {data.perUserPerDay}/dia</dd></div>
        </dl>
      )}
    </Card>
  );
}

const GROUPS: { title: string; fields: [keyof Settings, string][] }[] = [
  { title: "Troca de horário", fields: [["reschedule_min_hours", "Antecedência mínima (h)"], ["reschedule_limit", "Limite de trocas por tratamento"]] },
  { title: "Lista de espera", fields: [["waitlist_hold_minutes", "Tempo segurando a vaga (min)"]] },
  { title: "Pagamento", fields: [["pix_hold_minutes", "Reserva aguardando o PIX (min)"]] },
  { title: "Convênio", fields: [["renewal_estimate_days", "Prazo estimado (dias)"], ["renewal_alert_session", "Alerta na sessão"], ["renewal_reminder_session", "Lembrete na sessão"]] },
  { title: "Métrica de faltas", fields: [["late_cancel_hours", "Desmarcação tardia: menos de (h)"], ["baseline_noshow_pct", "Taxa de referência (%)"]] },
  { title: "Valores", fields: [["price_particular", "Sessão particular (R$)"], ["price_convenio", "Sessão convênio (R$)"]] },
];

export default function Page() {
  const { data, isLoading, error, refetch } = useQuery(q.settings);
  const save = useAction({
    run: (body: Partial<Settings>) => api("/admin/settings", { method: "PATCH", body }),
    optimistic: { key: ["settings"], update: (old: Settings, v: Partial<Settings>) => ({ ...old, ...v }) }, success: "Parâmetros salvos",
  });
  if (isLoading) return <ListSkeleton />;
  if (error || !data) return <ErrorState error={error} retry={refetch} />;
  return (
    <>
      <PageTitle eyebrow="Administração" title="Parâmetros" />
      <form className="stagger grid items-start gap-4 lg:grid-cols-2 xl:grid-cols-3" onSubmit={(e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
        const { reminder_hours, ...nums } = f;
        save.mutate({
          ...Object.fromEntries(Object.entries(nums).map(([k, v]) => [k, Number(v)])),
          reminder_hours: reminder_hours.split(",").map((h) => Number(h.trim())).filter(Boolean),
        });
      }}>
        {GROUPS.map((g) => (
          <Card key={g.title} className="flex flex-col gap-3">
            <h2 className="font-semibold">{g.title}</h2>
            {g.fields.map(([key, label]) => <Input key={key} label={label} name={key} type="number" min={0} step="any" defaultValue={String(data[key])} />)}
          </Card>
        ))}
        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold">Lembretes</h2>
          <Input label="Horas antes da sessão (separadas por vírgula)" name="reminder_hours" defaultValue={data.reminder_hours.join(", ")} />
          <Toggle label="Contar desmarcação tardia como falta" checked={data.count_late_cancel_as_no_show} onChange={(v) => save.mutate({ count_late_cancel_as_no_show: v })} />
        </Card>
        <AssistantCard />
        <Button type="submit" variant="brand" className="lg:col-span-2 xl:col-span-3" loading={save.isPending}>Salvar parâmetros</Button>
      </form>
      {DEMO_MODE && <div className="mt-4"><DemoReset /></div>}
    </>
  );
}
