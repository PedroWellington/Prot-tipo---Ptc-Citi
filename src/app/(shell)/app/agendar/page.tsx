"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { BookingWizard } from "@/components/booking-wizard";
import { ListSkeleton, PageTitle } from "@/components/ui";

function Content() {
  return <BookingWizard initialUnit={useSearchParams().get("unidade") ?? undefined} />;
}

export default function Page() {
  return (
    <>
      <PageTitle eyebrow="Novo pacote ou sessão avulsa" title="Agendar" />
      <div className="mx-auto max-w-2xl">
        <Suspense fallback={<ListSkeleton rows={3} />}><Content /></Suspense>
      </div>
    </>
  );
}
