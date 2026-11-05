import { CalendarCheck, CircleCheckBig, ShieldCheck } from "lucide-react";
import Image from "next/image";
import { SITE_SCREENS } from "@/lib/site-screens";

export type Screen = "paciente-celular" | "paciente-desktop" | "recepcao-desktop" | "fisio-desktop";

/**
 * As duas versões da tela (clara e escura) com display:none na que não vale: com loading lazy,
 * o navegador só baixa a do tema atual. A escondida fica fora da árvore de acessibilidade, então as duas têm o mesmo alt.
 */
export function Shot({ name, alt, sizes, priority }: { name: Screen; alt: string; sizes: string; priority?: boolean }) {
  return (
    <>
      {(["claro", "escuro"] as const).map((tema) => {
        const meta = SITE_SCREENS[`${name}-${tema}`];
        return (
          <Image key={tema} src={`/site/tela-${name}-${tema}-{w}.webp`} alt={alt}
            width={meta.width} height={meta.height} sizes={sizes} placeholder="blur" blurDataURL={meta.blur}
            loading={priority ? undefined : "lazy"} fetchPriority={priority ? "high" : undefined}
            className={`${tema === "claro" ? "shot-light" : "shot-dark"} h-full w-full object-cover object-top`} />
        );
      })}
    </>
  );
}

export function Laptop({ name, alt, sizes, priority }: { name: Screen; alt: string; sizes: string; priority?: boolean }) {
  return (
    <div className="device-laptop">
      <div className="screen"><Shot name={name} alt={alt} sizes={sizes} priority={priority} /></div>
      <div className="base" aria-hidden />
    </div>
  );
}

export function Phone({ name, alt, sizes, className }: { name: Screen; alt: string; sizes: string; className?: string }) {
  return <div className={`device-phone ${className ?? "relative"}`}><Shot name={name} alt={alt} sizes={sizes} /></div>;
}

/** Abertura: agenda da recepção no notebook, painel do paciente no celular e três avisos do próprio sistema. */
export function HeroMockup() {
  return (
    <div className="parallax relative mx-auto w-full max-w-[620px] pb-6 sm:pb-10">
      <div className="pr-[16%]">
        <Laptop name="recepcao-desktop" alt="Agenda do dia da recepção no sistema Movimento, com sessões confirmadas e a confirmar" sizes="(min-width: 1024px) 520px, 84vw" />
      </div>
      <Phone name="paciente-celular" alt="Painel do paciente no celular: anel de progresso na sessão 7 de 10 e fase Consolidação" sizes="(min-width: 1024px) 190px, 34vw"
        className="absolute right-0 bottom-0 w-[31%]" />
      <p aria-hidden className="float-card -top-3 left-[4%] sm:-top-5"><CircleCheckBig className="size-4 text-[#0a8f6a]" />Sessão 7 de 10</p>
      <p aria-hidden className="float-card top-[46%] -left-2 sm:-left-6"><CalendarCheck className="size-4 text-[#1f7fe0]" />Horário confirmado</p>
      <p aria-hidden className="float-card right-[20%] -bottom-3 hidden sm:flex"><ShieldCheck className="size-4 text-[#b7791f]" />Renovação do convênio solicitada</p>
    </div>
  );
}
