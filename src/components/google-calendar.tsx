"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarSync, RefreshCw, Unplug } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { fmtStamp } from "@/lib/time";
import type { status as googleStatus } from "@/server/services/google";
import { Sheet } from "./lazy-sheet";
import { useAction } from "./providers";
import { Button, Notice, Toggle } from "./ui";

type Status = Awaited<ReturnType<typeof googleStatus>>;
const BACK: Record<string, [string, "success" | "error"]> = {
  conectado: ["Google Agenda conectado. Os eventos já estão sendo criados.", "success"],
  erro: ["Não foi possível conectar o Google Agenda. Tente de novo.", "error"],
  cancelado: ["Conexão com o Google Agenda cancelada.", "error"],
};

/** Botão da equipe na Agenda. Sem as variáveis de ambiente fica desabilitado, com a explicação. */
export function GoogleButton({ configured }: { configured: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const p = new URLSearchParams(location.search).get("google");
    if (!p || !BACK[p]) return;
    toast[BACK[p][1]](BACK[p][0]);
    history.replaceState(null, "", location.pathname);
  }, []);
  if (!configured)
    return (
      <div className="flex flex-col items-end gap-1">
        <Button variant="line" disabled aria-describedby="google-off"><CalendarSync strokeWidth={1.5} className="size-4" />Conectar Google Agenda</Button>
        <span id="google-off" className="text-xs text-ink-3">Integração com Google Agenda não configurada</span>
      </div>
    );
  return (
    <>
      <Button variant="line" onClick={() => setOpen(true)}><CalendarSync strokeWidth={1.5} className="size-4" />Google Agenda</Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Google Agenda">{open && <GooglePanel />}</Sheet>
    </>
  );
}

function GooglePanel() {
  const { data, isLoading } = useQuery({ queryKey: ["google"], queryFn: () => api<Status>("/google/status") });
  const [removeEvents, setRemoveEvents] = useState(false);
  const sync = useAction({
    run: () => api<{ ok: boolean; error?: string; criados?: number; atualizados?: number; removidos?: number }>("/google/sync", { body: {} }),
    invalidate: [["google"]],
    onDone: (r) => (r.ok ? toast.success(`Sincronizado: ${r.criados} novos, ${r.atualizados} atualizados, ${r.removidos} removidos`) : toast.error(r.error ?? "Não foi possível sincronizar")),
  });
  const fullName = useAction({
    run: (v: boolean) => api("/google/settings", { method: "PATCH", body: { includeFullName: v } }),
    optimistic: { key: ["google"], update: (old: Status, v: boolean) => ({ ...old, includeFullName: v }) },
  });
  const disconnect = useAction({
    run: () => api("/google/disconnect", { body: { removeEvents } }), invalidate: [["google"]], success: "Google Agenda desconectado",
  });
  if (isLoading || !data) return <p className="text-sm text-ink-3">Carregando…</p>;

  if (!data.connected)
    return (
      <div className="flex flex-col gap-4">
        <Notice><b>Dados de agenda serão enviados ao Google.</b> Criamos um calendário só para a clínica (&quot;Clínica Movimento&quot;) na sua conta; sua agenda pessoal fica de fora.</Notice>
        <div className="text-sm text-ink-2">
          <p className="font-semibold text-ink">Vai para o Google</p>
          <p>Data e horário, unidade, status e as iniciais do paciente (ex.: &quot;Sessão - M.S.&quot;).</p>
          <p className="mt-2 font-semibold text-ink">Nunca vai</p>
          <p>CPF, telefone, e-mail, convênio, dor ou observações clínicas.</p>
        </div>
        {/* Rota da API que redireciona para o Google: navegação inteira, não do roteador */}
        <Button variant="brand" onClick={() => location.assign("/api/google/connect")}><CalendarSync strokeWidth={1.5} className="size-4" />Conectar Google Agenda</Button>
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-2">
        Conectado. {data.events} {data.events === 1 ? "evento" : "eventos"} no calendário &quot;Clínica Movimento&quot;.
        {data.lastSyncAt && <> Última sincronização: {fmtStamp(data.lastSyncAt)}.</>}
      </p>
      {data.lastError && <Notice className="text-warn">{data.lastError}. Tente &quot;Sincronizar agora&quot;.</Notice>}
      <Button onClick={() => sync.mutate()} loading={sync.isPending}><RefreshCw strokeWidth={1.5} className="size-4" />Sincronizar agora</Button>
      <Toggle label="Incluir nome completo" hint="Desligado: só as iniciais do paciente aparecem no evento." checked={!!data.includeFullName} onChange={(v) => fullName.mutate(v)} />
      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={removeEvents} onChange={(e) => setRemoveEvents(e.target.checked)} className="size-4" />Remover também os eventos criados</label>
        <Button variant="line" onClick={() => disconnect.mutate()} loading={disconnect.isPending}><Unplug strokeWidth={1.5} className="size-4" />Desconectar</Button>
      </div>
    </div>
  );
}
