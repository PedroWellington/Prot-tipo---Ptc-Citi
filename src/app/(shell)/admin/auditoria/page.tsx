"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { Button, ErrorState, ListSkeleton, PageTitle } from "@/components/ui";
import { q } from "@/lib/queries";
import { ROLE_LABEL } from "@/lib/labels";
import { fmtStamp } from "@/lib/time";

export default function Page() {
  const { data, isLoading, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery(q.audit);
  return (
    <>
      <PageTitle eyebrow="LGPD" title="Auditoria" />
      {isLoading && <ListSkeleton />}
      {error && <ErrorState error={error} retry={refetch} />}
      <ul className="card divide-y divide-line overflow-hidden">
        {data?.pages.flat().map((a) => (
          <li key={a.id} className="p-4">
            <p className="font-medium">{a.action.replaceAll("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}</p>
            <p className="text-sm text-ink-3">{fmtStamp(a.createdAt)} · {a.actor ? `${a.actor.name} (${ROLE_LABEL[a.actor.role]})` : "Sistema"} · {a.entity}</p>
          </li>
        ))}
      </ul>
      {hasNextPage && <Button variant="ghost" className="mt-3 w-full" loading={isFetchingNextPage} onClick={() => fetchNextPage()}>Carregar mais</Button>}
    </>
  );
}
