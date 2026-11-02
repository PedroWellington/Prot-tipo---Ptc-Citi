"use client";

import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { BookingWizard } from "@/components/booking-wizard";
import { Sheet } from "@/components/lazy-sheet";
import { PatientForm } from "@/components/patient-form";
import { Badge, Button, Empty, ErrorState, ListSkeleton, PageTitle, SearchField } from "@/components/ui";
import { api } from "@/lib/api";
import { q, type PatientRow as Row } from "@/lib/queries";

export default function Page() {
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [booking, setBooking] = useState<Row | null>(null);
  const qc = useQueryClient();
  const { data, isLoading, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery(q.deskPatients(search));
  const rows = data?.pages.flat();

  return (
    <>
      <PageTitle eyebrow="Recepção" title="Pacientes" action={<Button onClick={() => setAdding(true)}><UserPlus strokeWidth={1.5} className="size-4" />Cadastrar</Button>} />
      <div className="mb-4"><SearchField onSearch={setSearch} /></div>
      {isLoading && <ListSkeleton />}
      {error && <ErrorState error={error} retry={refetch} />}
      {rows && !rows.length && <div className="card"><Empty title="Ninguém encontrado" /></div>}
      {!!rows?.length && (
        <ul className="card grid overflow-hidden md:grid-cols-2 2xl:grid-cols-3">
          {rows.map((p) => {
            const t = p.treatments[0];
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-3 border-b border-line p-4">
                <div className="min-w-0 flex-1 basis-48">
                  <p className="truncate font-medium">{p.user.name}</p>
                  <p className="truncate text-sm text-ink-3">{p.cpf} · {p.type === "CONVENIO" ? p.insurer : "Particular"}</p>
                </div>
                {t?.status === "ATIVO" ? <Badge tone="accent">Sessão {t.completedSessions} de {t.totalSessions}</Badge> : (
                  <Button variant="ghost" onClick={() => setBooking(p)}><CalendarPlus strokeWidth={1.5} className="size-4" />Agendar</Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {hasNextPage && <Button variant="ghost" className="mt-3 w-full" loading={isFetchingNextPage} onClick={() => fetchNextPage()}>Carregar mais</Button>}

      <Sheet open={adding} onClose={() => setAdding(false)} title="Cadastrar paciente">
        <PatientForm submitLabel="Cadastrar e enviar acesso" consentLabel="O paciente autorizou o tratamento dos dados pessoais e de saúde, conforme a LGPD."
          onSubmit={async (data) => {
            await api("/desk/patients", { body: data });
            toast.success("Paciente cadastrado. O código de acesso foi enviado por e-mail.");
            setAdding(false);
            qc.invalidateQueries({ queryKey: ["patients"] });
          }} />
      </Sheet>
      <Sheet open={!!booking} onClose={() => setBooking(null)} title={booking ? `Agendar: ${booking.user.name}` : ""}>
        {booking && <BookingWizard patientId={booking.id} onBooked={() => qc.invalidateQueries({ queryKey: ["patients"] })} />}
      </Sheet>
    </>
  );
}
