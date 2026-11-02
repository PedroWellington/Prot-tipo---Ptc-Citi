"use client";

import { useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button, Card } from "./ui";

export function DemoReset() {
  const qc = useQueryClient();
  const [armed, setArmed] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  async function run() {
    setArmed(false);
    try {
      let step: number | null = 0;
      while (step !== null) {
        const r: { next: number | null; total: number } = await api("/admin/demo/reset", { body: { step } });
        setProgress(`${r.next ?? r.total} de ${r.total}`);
        step = r.next;
      }
      qc.clear();
      toast.success("Dados de demonstração restaurados.");
    } catch (err) {
      toast.error((err as Error).message);
    }
    setProgress(null);
  }

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="font-semibold">Dados de demonstração</h2>
      <p className="text-sm text-ink-2">Apaga tudo o que foi feito no sistema e recria os dados fictícios. Os administradores continuam, com a mesma senha.</p>
      {progress ? <Button variant="line" disabled>Restaurando: {progress}</Button>
        : armed ? <Button variant="danger" onClick={run}>Confirmar: apagar e restaurar</Button>
        : <Button variant="line" onClick={() => setArmed(true)}><RotateCcw strokeWidth={1.5} className="size-4" />Resetar dados de demonstração</Button>}
    </Card>
  );
}
