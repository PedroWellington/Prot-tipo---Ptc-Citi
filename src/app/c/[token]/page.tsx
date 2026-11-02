"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { use, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AuthFrame } from "@/components/auth-frame";
import { Button, ErrorState, Select, Skeleton, SuccessCheck } from "@/components/ui";
import { api } from "@/lib/api";
import { MISS_REASON_LABELS } from "@/lib/labels";
import { fmtLong, fmtTime } from "@/lib/time";

type Info = { usable: boolean; startsAt: string; number: number; status: string; unit: string; physio: string };
type Action = "confirmar" | "trocar" | "cancelar";

const COPY: Record<Action, { title: string; button: string; done: string }> = {
  confirmar: { title: "Confirmar presença?", button: "Confirmo", done: "Presença confirmada. Até lá!" },
  trocar: { title: "Quer trocar o horário?", button: "Escolher outro horário", done: "" },
  cancelar: { title: "Não vai poder ir?", button: "Não poderei ir", done: "Tudo bem, avisamos a clínica. Sua sessão será reposta ao final do plano." },
};

// GET nunca executa a ação: antivírus de e-mail abrem links sozinhos
function Confirm({ token }: { token: string }) {
  const params = useSearchParams();
  const action = (["confirmar", "trocar", "cancelar"].includes(params.get("a") ?? "") ? params.get("a") : "confirmar") as Action;
  const [reason, setReason] = useState("OUTRO");
  const { data, isLoading, error } = useQuery({ queryKey: ["token", token], queryFn: () => api<Info>(`/confirm/${token}`), retry: false });
  const send = useMutation({
    mutationFn: () => api<{ redirect: string | null }>(`/confirm/${token}`, { body: { action, reason } }),
    onSuccess: (r) => { if (r.redirect) window.location.assign(r.redirect); },
  });

  if (isLoading) return <AuthFrame title="Só um instante"><Skeleton className="h-32 w-full" /></AuthFrame>;
  if (error || !data) return <AuthFrame title="Link inválido"><ErrorState error={error} /></AuthFrame>;
  if (send.isSuccess && !send.data.redirect)
    return <AuthFrame title="Pronto"><div className="flex flex-col items-center gap-4 text-center"><SuccessCheck /><p className="text-ink-2">{COPY[action].done}</p></div></AuthFrame>;
  if (!data.usable) return <AuthFrame title="Este link já foi usado" subtitle="Ele vale uma vez só. Fale com a recepção se precisar de ajuda." ><span /></AuthFrame>;

  return (
    <AuthFrame title={COPY[action].title} subtitle={`Sessão ${data.number}: ${fmtLong(data.startsAt)} às ${fmtTime(data.startsAt)}, em ${data.unit}, com ${data.physio}.`}>
      {action === "cancelar" && (
        <div className="mb-4">
          <Select label="Pode nos contar o motivo?" value={reason} onChange={(e) => setReason(e.target.value)}>
            {Object.entries(MISS_REASON_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>
      )}
      <Button variant={action === "cancelar" ? "danger" : "brand"} className="w-full" loading={send.isPending} onClick={() => send.mutate()}>{COPY[action].button}</Button>
      {send.error && <p role="alert" className="mt-3 text-sm text-danger">{send.error.message}</p>}
    </AuthFrame>
  );
}

export default function ConfirmPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  return <Suspense><Confirm token={token} /></Suspense>;
}
