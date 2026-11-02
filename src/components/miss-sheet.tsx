"use client";

import { useState } from "react";
import { MISS_REASON_LABELS } from "@/lib/labels";
import { Sheet } from "./lazy-sheet";
import { Button, Segmented, Select, Textarea } from "./ui";

export type MissInput = { status: "FALTA" | "DESMARCADA"; reason: string; note?: string };

/** Registro padronizado, igual nas duas unidades: Falta ≠ Desmarcação, motivo sempre obrigatório. */
export function MissSheet({ open, onClose, onSubmit, title = "Registrar ausência", confirmLabel = "Registrar", hideStatus }: {
  open: boolean; onClose: () => void; onSubmit: (v: MissInput) => void; title?: string; confirmLabel?: string; hideStatus?: boolean;
}) {
  const [status, setStatus] = useState<MissInput["status"]>("FALTA");
  const [reason, setReason] = useState("ALIVIO_DOR");
  const [note, setNote] = useState("");
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="flex flex-col gap-4">
        {!hideStatus && (
          <>
            <Segmented label="Tipo" value={status} onChange={setStatus} options={[{ value: "FALTA", label: "Falta" }, { value: "DESMARCADA", label: "Desmarcação" }]} />
            <p className="text-sm text-ink-2">{status === "FALTA" ? "Não compareceu e não avisou." : "Avisou antes: a antecedência é registrada automaticamente."} Uma sessão de reposição é criada ao fim do plano.</p>
          </>
        )}
        <Select label="Motivo" value={reason} onChange={(e) => setReason(e.target.value)}>
          {Object.entries(MISS_REASON_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Textarea label="Observação (opcional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        <Button onClick={() => { onSubmit({ status, reason, note }); onClose(); }} className="w-full">{confirmLabel}</Button>
      </div>
    </Sheet>
  );
}
