"use client";

import { useQuery } from "@tanstack/react-query";
import { useAction } from "@/components/providers";
import { Badge, Button, Card, ErrorState, ListSkeleton, PageTitle, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { q } from "@/lib/queries";

export default function Page() {
  const { data, isLoading, error, refetch } = useQuery(q.messages);
  const save = useAction({
    run: ({ id, text }: { id: string; text: string }) => api(`/admin/messages/${id}`, { method: "PATCH", body: { text } }),
    invalidate: [["messages"]], success: "Texto salvo",
  });
  return (
    <>
      <PageTitle eyebrow="Administração" title="Textos educativos" />
      {isLoading && <ListSkeleton />}
      {error && <ErrorState error={error} retry={refetch} />}
      <div className="grid items-start gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {data?.map((m) => (
          <Card key={m.id}>
            <form key={m.version} className="flex flex-col gap-3" onSubmit={(e) => {
              e.preventDefault();
              save.mutate({ id: m.id, text: String(new FormData(e.currentTarget).get("text")) });
            }}>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Sessão {m.sessionNumber} de {m.totalSessions}</h2>
                <Badge>versão {m.version}</Badge>
              </div>
              <Textarea label="Texto exibido ao paciente" name="text" rows={4} defaultValue={m.text} maxLength={800} required />
              <Button type="submit" variant="ghost" className="self-end">Salvar</Button>
            </form>
          </Card>
        ))}
      </div>
    </>
  );
}
