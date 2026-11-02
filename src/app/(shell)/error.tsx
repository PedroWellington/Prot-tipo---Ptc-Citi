"use client";

import { ErrorState } from "@/components/ui";

// O shell continua na tela: uma falha aqui não derruba a navegação
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return <div className="card"><ErrorState error={error} retry={reset} /></div>;
}
