"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Info, Printer } from "lucide-react";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { restorePendingNotice } from "@/components/payment-notices";
import { haptic } from "@/components/providers";
import { Badge, Button, Card, ErrorState, LinkButton, ListSkeleton, PageTitle, SuccessCheck } from "@/components/ui";
import { api } from "@/lib/api";
import { q } from "@/lib/queries";
import { fmtStamp, fmtTime } from "@/lib/time";
import type { paymentView } from "@/server/services/payments";

type View = Awaited<ReturnType<typeof paymentView>>;

const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function copyText(text: string) {
  if (navigator.clipboard) return navigator.clipboard.writeText(text);
  // Fora de https o navegador não oferece a Clipboard API
  const area = document.createElement("textarea");
  area.value = text;
  document.body.append(area);
  area.select();
  document.execCommand("copy");
  area.remove();
  return Promise.resolve();
}

function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <p className="rounded-xl bg-surface-2 p-3 font-mono text-xs break-all text-ink-2">{code}</p>
      <Button variant="brand" className="w-full" onClick={() => {
        // Feedback antes da promessa: resposta instantânea ao toque
        setCopied(true); haptic();
        void copyText(code);
        setTimeout(() => setCopied(false), 2000);
      }}>
        {copied ? <Check strokeWidth={1.5} className="size-4" /> : <Copy strokeWidth={1.5} className="size-4" />}
        {copied ? "Copiado" : "Copiar código PIX"}
      </Button>
    </div>
  );
}

function Summary({ p }: { p: View }) {
  return (
    <dl className="flex flex-col gap-2 text-sm">
      <div className="flex justify-between gap-3"><dt className="text-ink-3">Sessões</dt><dd>{p.sessionCount} × {brl(p.unitPriceCents)}</dd></div>
      <div className="flex items-baseline justify-between gap-3 border-t border-line pt-2"><dt className="text-ink-3">Total</dt><dd className="font-display text-3xl tabular-nums">{brl(p.amountCents)}</dd></div>
    </dl>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: p, isLoading, error, refetch } = useQuery({
    queryKey: ["payment", id], queryFn: () => api<View>(`/me/payments/${id}`), placeholderData: undefined,
    // Tempo real leve: a confirmação da recepção aparece sozinha
    refetchInterval: (query) => (query.state.data?.status === "AGUARDANDO" ? 5_000 : false),
  });
  const router = useRouter();
  const qc = useQueryClient();
  useEffect(() => restorePendingNotice(id), [id]);
  // Reserva vencida não tem tela própria: volta ao início, onde o aviso explica o que houve
  const expired = p?.status === "EXPIRADO";
  useEffect(() => {
    if (!expired) return;
    void qc.invalidateQueries({ queryKey: q.home.queryKey });
    router.replace("/app");
  }, [expired, router, qc]);

  if (isLoading || expired) return <ListSkeleton rows={3} />;
  if (error || !p) return <ErrorState error={error} retry={refetch} />;

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle eyebrow="Pagamento via PIX" title={p.status === "PAGO" ? "Comprovante" : "Falta pouco"}
        action={<Badge tone={p.status === "PAGO" ? "ok" : "warn"}>{p.status === "PAGO" ? "Pago" : "Aguardando pagamento"}</Badge>} />

      {p.status === "AGUARDANDO" && (
        <div className="grid items-start gap-4 md:grid-cols-[300px_1fr]">
          <Card className="flex flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- QR gerado no servidor em data URI */}
            <img src={p.qr!} alt="QR Code do PIX" width={260} height={260} className="rounded-xl bg-white p-2" />
            <p className="text-center text-sm text-ink-2">Abra o app do banco e escaneie, ou copie o código ao lado.</p>
          </Card>
          <Card className="flex flex-col gap-4">
            <Summary p={p} />
            <CopyCode code={p.pixCode!} />
            <p className="text-sm text-ink-2">Seu horário fica reservado até <b className="font-semibold text-ink">{fmtTime(p.expiresAt)}</b>. Depois disso, ele é liberado.</p>
            {!p.automatic && (
              <p className="flex gap-2 text-sm text-ink-3"><Info strokeWidth={1.5} className="size-4 shrink-0" />A confirmação é manual: a recepção confere o recebimento, e esta tela atualiza sozinha.</p>
            )}
          </Card>
        </div>
      )}

      {p.status === "PAGO" && (
        <Card className="flex flex-col gap-4">
          <div className="flex flex-col items-center gap-2 text-center">
            <SuccessCheck />
            <p className="text-ink-2">Pagamento confirmado. Suas sessões estão reservadas.</p>
          </div>
          <Summary p={p} />
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-ink-3">Comprovante</dt><dd className="font-mono">{p.receipt}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-ink-3">Data</dt><dd>{fmtStamp(p.paidAt!)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-ink-3">Recebedor</dt><dd>Clínica Movimento</dd></div>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button variant="line" className="flex-1" onClick={() => window.print()}><Printer strokeWidth={1.5} className="size-4" />Imprimir</Button>
            <LinkButton href="/app" className="flex-1">Ver tratamento</LinkButton>
          </div>
        </Card>
      )}

    </div>
  );
}
