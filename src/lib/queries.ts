import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import type { Home } from "@/components/patient-home";
import type { Unit } from "@/components/patient-form";
import type { Settings, listAudit, listProgressMessages, listUnits } from "@/server/repositories/config";
import type { allWaitlist, patientRequests, patientWaitlist, renewalQueue } from "@/server/repositories/requests";
import type { listStaff } from "@/server/repositories/users";
import type { patientOffers as late } from "@/server/services/late";
import type { profile, staffSearch } from "@/server/services/patients";
import type { patientPayments, pendingPayments } from "@/server/services/payments";
import type { inbox } from "@/server/services/whatsapp";
import type { requestQueue } from "@/server/services/reschedule";
import type { unitsOverview } from "@/server/services/schedule";
import { api } from "./api";
import { HOUR } from "./time";

type Out<F extends (...a: never[]) => unknown> = Awaited<ReturnType<F>>;

const FIVE_MIN = 300_000;

export type PatientRow = Out<typeof staffSearch>[number];
export type PendingPayment = Out<typeof pendingPayments>[number];
export type WhatsAppBox = { simulated: boolean; messages: Out<typeof inbox> };
export type LateOfferRow = Out<typeof late>[number];
const PAGE = 30;

// Fonte única de chaves e buscas: a tela e o pré-carregamento do shell usam a mesma entrada
export const q = {
  units: queryOptions({ queryKey: ["units"], queryFn: () => api<Unit[]>("/units"), staleTime: HOUR }),
  home: queryOptions({ queryKey: ["home"], queryFn: () => api<Home>("/me/home") }),
  requests: queryOptions({
    queryKey: ["requests"], queryFn: () => api<Out<typeof patientRequests>>("/me/requests"),
    // Tempo real leve: acelera enquanto há pedido pendente
    refetchInterval: (query) => (query.state.data?.some((r) => r.status === "PENDENTE") ? 5_000 : 30_000),
  }),
  waitlist: queryOptions({ queryKey: ["waitlist"], queryFn: () => api<Out<typeof patientWaitlist>>("/me/waitlist"), refetchInterval: 30_000 }),
  profile: queryOptions({ queryKey: ["profile"], queryFn: () => api<Out<typeof profile>>("/me/profile"), staleTime: FIVE_MIN }),
  unitsOverview: queryOptions({ queryKey: ["units-overview"], queryFn: () => api<Out<typeof unitsOverview>>("/me/units"), staleTime: FIVE_MIN }),
  bookingInfo: queryOptions({ queryKey: ["booking-info"], queryFn: () => api<{ type: "PARTICULAR" | "CONVENIO"; priceCents: number }>("/me/booking-info"), staleTime: HOUR }),
  payments: queryOptions({ queryKey: ["payments"], queryFn: () => api<Out<typeof patientPayments>>("/me/payments") }),
  lateOffers: queryOptions({ queryKey: ["late-offers"], queryFn: () => api<LateOfferRow[]>("/me/late-offers"), refetchInterval: 15_000 }),
  deskPayments: queryOptions({ queryKey: ["desk-payments"], queryFn: () => api<PendingPayment[]>("/desk/payments"), refetchInterval: 15_000 }),
  whatsapp: queryOptions({ queryKey: ["whatsapp"], queryFn: () => api<WhatsAppBox>("/desk/whatsapp"), refetchInterval: 5_000 }),
  deskRequests: queryOptions({ queryKey: ["desk-requests"], queryFn: () => api<Out<typeof requestQueue>>("/desk/requests"), refetchInterval: 10_000 }),
  deskRenewals: queryOptions({ queryKey: ["desk-renewals"], queryFn: () => api<Out<typeof renewalQueue>>("/desk/renewals"), refetchInterval: 30_000 }),
  deskWaitlist: queryOptions({ queryKey: ["desk-waitlist"], queryFn: () => api<Out<typeof allWaitlist>>("/desk/waitlist"), refetchInterval: 30_000 }),
  deskPatients: (search: string) => infiniteQueryOptions({
    queryKey: ["patients", search], initialPageParam: 0,
    queryFn: ({ pageParam }) => api<PatientRow[]>(`/desk/patients?take=${PAGE}&skip=${pageParam}${search ? `&q=${encodeURIComponent(search)}` : ""}`),
    getNextPageParam: (last, all) => (last.length === PAGE ? all.length * PAGE : undefined),
  }),
  // Sem busca: só quem está em tratamento. A busca vai ao servidor e alcança todo o histórico
  physioPatients: (search: string) => queryOptions({
    queryKey: ["physio-patients", search],
    queryFn: () => api<PatientRow[]>(`/desk/patients?take=100${search ? `&q=${encodeURIComponent(search)}` : "&ativos=1"}`),
  }),
  staff: queryOptions({ queryKey: ["staff"], queryFn: () => api<Out<typeof listStaff>>("/admin/users?take=100"), staleTime: FIVE_MIN }),
  adminUnits: queryOptions({ queryKey: ["admin-units"], queryFn: () => api<Out<typeof listUnits>>("/admin/units"), staleTime: FIVE_MIN }),
  settings: queryOptions({ queryKey: ["settings"], queryFn: () => api<Settings>("/admin/settings"), staleTime: FIVE_MIN }),
  messages: queryOptions({ queryKey: ["messages"], queryFn: () => api<Out<typeof listProgressMessages>>("/admin/messages"), staleTime: HOUR }),
  audit: infiniteQueryOptions({
    queryKey: ["audit"], initialPageParam: 0,
    queryFn: ({ pageParam }) => api<Out<typeof listAudit>>(`/admin/audit?take=50&skip=${pageParam}`),
    getNextPageParam: (last, all) => (last.length === 50 ? all.length * 50 : undefined),
  }),
};
