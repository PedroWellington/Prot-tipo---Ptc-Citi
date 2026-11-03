"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { BookingWizard } from "@/components/booking-wizard";
import { ExpiredNotice } from "@/components/payment-notices";
import { ListSkeleton, PageTitle } from "@/components/ui";
import { q } from "@/lib/queries";

function Content() {
  return <BookingWizard initialUnit={useSearchParams().get("unidade") ?? undefined} />;
}

export default function Page() {
  const expired = useQuery(q.home).data?.expiredPayment;
  return (
    <>
      <PageTitle eyebrow="Novo pacote ou sessão avulsa" title="Agendar" />
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        {/* Já está em Agendar: só o aviso, sem o botão para vir aqui */}
        {expired && <ExpiredNotice id={expired} cta={false} />}
        <Suspense fallback={<ListSkeleton rows={3} />}><Content /></Suspense>
      </div>
    </>
  );
}
