import { CalendarCheck, Check, CircleCheckBig, ShieldCheck } from "lucide-react";
import { Laptop, Phone } from "./mockup";

/**
 * "Veja o sistema por dentro": só a visão de quem se trata. Sem abas e sem JavaScript (componente de servidor);
 * as telas internas da clínica (recepção, fisioterapeuta, administração) não aparecem na página pública.
 */
export function SystemTour({ points }: { points: string[] }) {
  return (
    <div className="grid gap-10 lg:grid-cols-12 lg:items-center">
      <ul className="flex flex-col gap-4 lg:col-span-5">
        {points.map((p) => (
          <li key={p} className="flex gap-3 text-lg leading-snug">
            <span aria-hidden className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"><Check className="size-4" /></span>{p}
          </li>
        ))}
      </ul>
      <div className="relative mx-auto w-full max-w-[640px] pb-6 sm:pb-10 lg:col-span-7">
        <div className="pr-[16%]">
          <Laptop name="paciente-desktop" alt="Painel do paciente no computador: progresso da sessão, próxima sessão, evolução da dor e exercícios" sizes="(min-width: 1024px) 520px, 84vw" />
        </div>
        <Phone name="paciente-celular" alt="O mesmo painel no celular: anel de progresso na sessão 7 de 10 e fase Consolidação" sizes="(min-width: 1024px) 190px, 34vw"
          className="absolute right-0 bottom-0 w-[31%]" />
        <p aria-hidden className="float-card -top-3 left-[4%] sm:-top-5"><CircleCheckBig className="size-4 text-ok" />Sessão 7 de 10</p>
        <p aria-hidden className="float-card top-[46%] -left-2 sm:-left-6"><CalendarCheck className="size-4 text-info" />Horário confirmado</p>
        <p aria-hidden className="float-card right-[20%] -bottom-3 hidden sm:flex"><ShieldCheck className="size-4 text-warn" />Renovação do convênio solicitada</p>
      </div>
    </div>
  );
}
