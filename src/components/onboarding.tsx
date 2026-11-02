"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { ThemeToggle } from "./theme-toggle";
import { Button } from "./ui";

const STEPS = [
  {
    title: "Seu tratamento, passo a passo",
    body: "Veja em que sessão você está e o que esperar de cada fase, do primeiro dia à alta.",
    art: <path d="M60 12a48 48 0 1 1-34 14" strokeWidth="3" strokeLinecap="round" />,
  },
  {
    title: "Menos dor não é o fim",
    body: "Sentir alívio mostra que está funcionando. Vamos lembrar você de por que as sessões finais protegem o resultado.",
    art: <path d="M10 88c22 0 22-52 50-52s28 34 50 34" strokeWidth="3" strokeLinecap="round" />,
  },
  {
    title: "Mudou a rotina? A gente ajusta",
    body: "Troque horários pelo celular, sem perder sua vaga, e acompanhe a renovação do convênio por aqui.",
    art: <path d="M24 44h66l-16-16M96 76H30l16 16" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />,
  },
];

export function Onboarding() {
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(true);
  if (!open) return null;
  const s = STEPS[step];
  const finish = () => {
    setOpen(false);
    api("/me/profile", { method: "PATCH", body: { onboarded: true } }).catch(() => {});
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Boas-vindas" className="fixed inset-0 z-50 flex flex-col justify-end bg-bg px-6 pb-[calc(32px+env(safe-area-inset-bottom))] sm:items-center sm:justify-center">
      <ThemeToggle className="absolute top-4 right-4" />
      <div key={step} className="page-enter flex w-full max-w-md flex-1 flex-col justify-center sm:flex-none">
        <svg viewBox="0 0 120 120" fill="none" stroke="url(#ob-g)" className="mb-10 size-32" aria-hidden>
          <defs><linearGradient id="ob-g"><stop stopColor="var(--ring-a)" /><stop offset="1" stopColor="var(--ring-c)" /></linearGradient></defs>
          {s.art}
        </svg>
        <h2 className="font-display text-[40px] leading-[1.05]">{s.title}</h2>
        <p className="mt-4 text-lg text-ink-2">{s.body}</p>
      </div>
      <div className="w-full max-w-md sm:mt-10">
        <div className="mb-6 flex gap-2" aria-label={`Passo ${step + 1} de ${STEPS.length}`}>
          {STEPS.map((_, i) => <span key={i} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-accent" : "bg-line-strong"}`} />)}
        </div>
        <div className="flex gap-3">
          <Button variant="ghost" onClick={finish}>Pular</Button>
          <Button variant="brand" className="flex-1" onClick={() => (step === STEPS.length - 1 ? finish() : setStep(step + 1))}>
            {step === STEPS.length - 1 ? "Começar" : "Continuar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
