"use client";

import { useQuery } from "@tanstack/react-query";
import { FlaskConical, MessageCircle } from "lucide-react";
import { useAction } from "@/components/providers";
import { Badge, Button, Card, Empty, ErrorState, ListSkeleton, PageTitle } from "@/components/ui";
import { api } from "@/lib/api";
import { formatPhone } from "@/lib/labels";
import { q, type WhatsAppBox } from "@/lib/queries";
import { fmtStamp } from "@/lib/time";

type Message = WhatsAppBox["messages"][number];
type Reply = { id: string; button: string; label: string };

export default function Page() {
  const { data, isLoading, error, refetch } = useQuery(q.whatsapp);
  const reply = useAction({
    run: ({ id, button }: Reply) => api(`/desk/whatsapp/${id}/reply`, { body: { button } }),
    optimistic: {
      key: q.whatsapp.queryKey,
      update: (old: WhatsAppBox, v: Reply) => ({
        ...old, messages: old.messages.map((m) => (m.id === v.id ? { ...m, reply: v.label, repliedAt: new Date() } : m)),
      }),
    },
    invalidate: [["agenda"]],
  });
  const simulated = data?.simulated ?? true;

  return (
    <>
      <PageTitle eyebrow="Recepção" title={simulated ? "Caixa do WhatsApp (simulação)" : "Caixa do WhatsApp"} />
      {simulated && (
        <Card className="mb-4 flex gap-3 border-warn/40">
          <FlaskConical strokeWidth={1.5} className="size-5 shrink-0 text-warn" />
          <p className="text-sm text-ink-2"><b className="font-semibold text-ink">Nenhuma mensagem real é enviada.</b> Até conectar a API oficial (conta WhatsApp Business e templates aprovados pela Meta), tudo fica aqui. Toque nas respostas para agir como o paciente e ver o fluxo completo.</p>
        </Card>
      )}
      {isLoading && <ListSkeleton />}
      {error && <ErrorState error={error} retry={refetch} />}
      {data && !data.messages.length && (
        <div className="card"><Empty art={<MessageCircle strokeWidth={1.2} className="size-10 text-ink-3" />} title="Nenhuma mensagem" body="Marque um paciente como atrasado na Agenda para ver o fluxo." /></div>
      )}
      <div className="stagger grid grid-cols-1 items-start gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {data?.messages.map((m: Message) => (
          <Card key={m.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{m.contact}</p>
                <p className="text-sm text-ink-3">{formatPhone(m.phone)} · {fmtStamp(m.createdAt)}</p>
              </div>
              {m.simulated && <Badge tone="warn">Simulada</Badge>}
            </div>
            <p className="mt-3 rounded-xl rounded-tl-sm bg-surface-2 p-3 text-sm">{m.text}</p>
            {m.reply ? (
              <p className="mt-2 ml-auto w-fit rounded-xl rounded-tr-sm bg-accent-soft px-3 py-2 text-sm font-medium">{m.reply}</p>
            ) : (
              simulated && !!(m.buttons as Reply[] | null)?.length && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {(m.buttons as { id: string; label: string }[]).map((b) => (
                    <Button key={b.id} variant="ghost" className="flex-1" onClick={() => reply.mutate({ id: m.id, button: b.id, label: b.label })}>{b.label}</Button>
                  ))}
                </div>
              )
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
