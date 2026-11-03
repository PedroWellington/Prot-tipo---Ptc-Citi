"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import type { adminSiteContent } from "@/server/services/site";
import { useAction } from "@/components/providers";
import { Badge, Button, Card, ErrorState, Input, ListSkeleton, PageTitle, Textarea } from "@/components/ui";
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
      <PageTitle eyebrow="Administração" title="Textos" />
      <SiteTexts />
      <h2 className="mt-10 mb-3 font-display text-3xl">Textos educativos</h2>
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

type SiteField = Awaited<ReturnType<typeof adminSiteContent>>[number];

/** Página inicial (pública): salvar publica na hora, sem esperar a revalidação. */
function SiteTexts() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["site-content"], queryFn: () => api<SiteField[]>("/admin/site-content"), staleTime: 300_000 });
  const save = useAction({
    run: ({ key, value }: { key: string; value: string }) => api(`/admin/site-content/${encodeURIComponent(key)}`, { method: "PATCH", body: { value } }),
    invalidate: [["site-content"]], success: "Texto publicado na página inicial",
  });
  const sections = [...new Set(data?.map((f) => f.section) ?? [])];
  return (
    <section aria-labelledby="site-t">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="site-t" className="font-display text-3xl">Página inicial</h2>
          <p className="text-sm text-ink-3">A página pública da clínica. Cada texto salvo aparece no site na hora.</p>
        </div>
        <a href="/" target="_blank" rel="noreferrer" className="btn btn-line"><ExternalLink strokeWidth={1.6} className="size-4" />Ver a página</a>
      </div>
      {isLoading && <ListSkeleton rows={2} />}
      {error && <ErrorState error={error} retry={refetch} />}
      <div className="flex flex-col gap-3">
        {sections.map((sec) => (
          <details key={sec} className="card group p-5 sm:p-6">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between font-semibold [&::-webkit-details-marker]:hidden">
              {sec}<Badge>{data!.filter((f) => f.section === sec).length} campos</Badge>
            </summary>
            <div className="mt-3 grid gap-4 lg:grid-cols-2">
              {data!.filter((f) => f.section === sec).map((f) => (
                <form key={f.key + (f.updatedAt ?? "")} className="flex flex-col gap-2" onSubmit={(e) => {
                  e.preventDefault();
                  save.mutate({ key: f.key, value: String(new FormData(e.currentTarget).get("value")) });
                }}>
                  {f.long
                    ? <Textarea label={f.label} name="value" rows={4} defaultValue={f.value} maxLength={2000} required />
                    : <Input label={f.label} name="value" defaultValue={f.value} maxLength={300} required />}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-ink-3">{f.value === f.default ? "Texto padrão" : "Editado"}</span>
                    <Button type="submit" variant="ghost" className="min-h-10">Salvar</Button>
                  </div>
                </form>
              ))}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
