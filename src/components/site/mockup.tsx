import Image from "next/image";
import { SITE_SCREENS } from "@/lib/site-screens";

// Só telas do paciente: a página pública não mostra as visões internas da clínica
export type Screen = "paciente-celular" | "paciente-desktop";

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
          <Image key={tema} src={`/site/tela-v2-${name}-${tema}-{w}.webp`} alt={alt}
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
