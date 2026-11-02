"use client";

import { useQuery } from "@tanstack/react-query";
import { Clock, LocateFixed, MapPin, Navigation, Phone } from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { BairroInput, loadBairros, useBairros } from "@/components/bairro-input";
import { useAction } from "@/components/providers";
import { Badge, Button, Card, ErrorState, LinkButton, ListSkeleton, PageTitle, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { localizarBairro, ordenarPorDistancia, type Point } from "@/lib/bairros";
import { q } from "@/lib/queries";
import { fmtTime, fmtWeekShort } from "@/lib/time";
import type { unitsOverview } from "@/server/services/schedule";

const UnitMap = dynamic(() => import("@/components/unit-map"), { ssr: false, loading: () => <Skeleton className="h-64 w-full sm:h-80" /> });

type Unit = Awaited<ReturnType<typeof unitsOverview>>[number];
type Origem = Point & { bairro: string; fonte: "dispositivo" | "bairro"; exato: boolean };

const CHAVE = "mv-origem";

// LGPD: as coordenadas ficam só nesta sessão do navegador; nunca vão para o servidor
function lerOrigem(): Origem | null {
  try {
    const salvo = typeof window === "undefined" ? null : sessionStorage.getItem(CHAVE);
    return salvo ? (JSON.parse(salvo) as Origem) : null;
  } catch {
    return null;
  }
}
function gravarOrigem(o: Origem) {
  try { sessionStorage.setItem(CHAVE, JSON.stringify(o)); } catch { /* sessão bloqueada: vale só nesta tela */ }
}

function UnitCard({ u, km, nearest }: { u: Unit; km: number | null; nearest: boolean }) {
  return (
    <Card className={nearest ? "border-accent/40" : undefined}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-3xl leading-tight">{u.name}</h2>
          {km !== null && <p className="text-sm text-ink-2">a cerca de {km < 10 ? km.toFixed(1).replace(".", ",") : Math.round(km)} km</p>}
        </div>
        {nearest && <Badge tone="accent"><LocateFixed className="size-3.5" />Mais perto de você</Badge>}
      </div>
      <ul className="mt-3 flex flex-col gap-1.5 text-sm text-ink-2">
        <li className="flex gap-2"><MapPin strokeWidth={1.5} className="size-4 shrink-0" />{u.address}</li>
        <li className="flex gap-2"><Clock strokeWidth={1.5} className="size-4 shrink-0" />Seg a sex, {u.openHour}h às {u.closeHour}h{u.saturdayEnabled && ` · Sáb, ${u.satOpenHour}h às ${u.satCloseHour}h`}</li>
        <li className="flex gap-2"><Phone strokeWidth={1.5} className="size-4 shrink-0" />{u.phone}</li>
      </ul>
      <p className="mt-3 text-sm text-ink-2"><span className="text-ink-3">Fisioterapeutas: </span>{u.physios.map((p) => p.name).join(", ")}</p>

      <h3 className="mt-4 mb-2 text-sm font-semibold">Horários nos próximos 7 dias <span className="font-normal text-ink-3">({u.totalFree} livres)</span></h3>
      <div className="flex flex-wrap gap-1.5">
        {u.slots.map((s) => (
          <span key={String(s.startsAt)} className="rounded-lg bg-surface-2 px-2.5 py-1.5 text-sm tabular-nums first-letter:uppercase">{fmtWeekShort(s.startsAt).split(" ")[0]} {fmtTime(s.startsAt)}</span>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <LinkButton variant="primary" href={`/app/agendar?unidade=${u.id}`} className="flex-1">Agendar aqui</LinkButton>
        <LinkButton variant="ghost" href={`/app/troca?unidade=${u.id}`} className="flex-1">Trocar para esta</LinkButton>
      </div>
      <div className="mt-2 flex gap-2">
        <a href={`https://www.google.com/maps/dir/?api=1&destination=${u.lat},${u.lng}`} target="_blank" rel="noreferrer" className="btn btn-line flex-1"><Navigation strokeWidth={1.5} className="size-4" />Google Maps</a>
        <a href={`https://waze.com/ul?ll=${u.lat},${u.lng}&navigate=yes`} target="_blank" rel="noreferrer" className="btn btn-line flex-1">Waze</a>
      </div>
    </Card>
  );
}

export default function Page() {
  const { data, isLoading, error, refetch } = useQuery(q.unitsOverview);
  const { data: perfil } = useQuery(q.profile);
  const bairros = useBairros();
  const [escolhida, setEscolhida] = useState<Origem | null>(lerOrigem);
  const [geo, setGeo] = useState<"idle" | "asking" | "denied">("idle");
  const [precisao, setPrecisao] = useState(false);

  const salvar = useAction({
    run: (bairro: string) => api("/me/profile", { method: "PATCH", body: { bairro } }),
    optimistic: { key: q.profile.queryKey, update: (old: NonNullable<typeof perfil>, bairro: string) => ({ ...old, bairro }) },
    success: "Bairro salvo no seu perfil",
  });

  // Sem GPS, a origem é o bairro do cadastro: a tela nunca fica bloqueada
  const doCadastro = useMemo<Origem | null>(() => {
    const b = bairros.find((x) => x.nome === perfil?.bairro);
    return b ? { ...b.centroide, bairro: b.nome, fonte: "bairro", exato: true } : null;
  }, [bairros, perfil?.bairro]);
  const origem = escolhida ?? doCadastro;

  const usar = (o: Origem) => { setEscolhida(o); gravarOrigem(o); };

  const pedirLocalizacao = () => {
    if (!("geolocation" in navigator) || !window.isSecureContext) return setGeo("denied");
    setGeo("asking");
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const ponto = { lat: coords.latitude, lng: coords.longitude };
        const achado = localizarBairro(ponto, await loadBairros());
        usar({ ...ponto, bairro: achado?.bairro.nome ?? "", fonte: "dispositivo", exato: !!achado?.exato });
        setGeo("idle");
      },
      () => setGeo("denied"),
      { enableHighAccuracy: precisao, timeout: 10_000, maximumAge: 300_000 },
    );
  };

  const ranked = useMemo(() => {
    if (!data) return [];
    return origem ? ordenarPorDistancia(origem, data) : data.map((u) => ({ ...u, km: null }));
  }, [data, origem]);

  return (
    <>
      <PageTitle eyebrow="Boa Viagem e Casa Forte" title="Unidades" />
      {isLoading && <ListSkeleton rows={2} />}
      {error && <ErrorState error={error} retry={refetch} />}
      {data && (
        <div className="flex flex-col gap-4">
          <div className="grid items-stretch gap-4 lg:grid-cols-2">
            <Card className="flex flex-col gap-3">
              <div>
                <h2 className="font-semibold">Qual unidade fica mais perto?</h2>
                {origem ? (
                  <p className="mt-1 text-ink-2">
                    {origem.fonte === "dispositivo" ? (origem.exato ? "Você está em " : "Bairro mais próximo de você: ") : "Calculando a partir de "}
                    <b className="font-semibold text-ink">{origem.bairro}</b>
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-ink-2">Escolha seu bairro ou use a localização do aparelho.</p>
                )}
              </div>
              <p className="text-sm text-ink-3">A localização é usada só neste aparelho, para calcular a distância. Ela não é enviada à clínica. Só o bairro fica salvo, se você escolher salvar.</p>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="ghost" onClick={pedirLocalizacao} loading={geo === "asking"}><LocateFixed strokeWidth={1.5} className="size-4" />{geo === "asking" ? "Localizando…" : "Usar minha localização"}</Button>
                <label className="flex min-h-11 items-center gap-2 text-sm text-ink-2">
                  <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={precisao} onChange={(e) => setPrecisao(e.target.checked)} />Alta precisão
                </label>
              </div>
              {geo === "denied" && <p className="text-sm text-warn">Sem acesso à localização neste navegador. Tudo bem: escolha o bairro abaixo.</p>}
              <BairroInput label="Ou escolha o bairro" onPick={(b) => usar({ ...b.centroide, bairro: b.nome, fonte: "bairro", exato: true })} />
              {origem && origem.bairro && origem.bairro !== perfil?.bairro && (
                <Button variant="line" onClick={() => salvar.mutate(origem.bairro)}>Salvar {origem.bairro} como meu bairro</Button>
              )}
            </Card>
            <div className="card overflow-hidden"><UnitMap units={data} me={origem} /></div>
          </div>
          <div className="grid items-start gap-4 md:grid-cols-2">
            {ranked.map((u, i) => <UnitCard key={u.id} u={u} km={u.km} nearest={!!origem && i === 0} />)}
          </div>
        </div>
      )}
    </>
  );
}
