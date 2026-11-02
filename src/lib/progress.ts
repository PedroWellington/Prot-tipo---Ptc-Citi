export type ProgressEntry = { sessionNumber: number; totalSessions: number; text: string };

export function progressOf(completed: number, total: number) {
  const done = Math.min(Math.max(completed, 0), total);
  return { done, total, ratio: total > 0 ? done / total : 0, finished: done >= total };
}

export const phaseLabel = (done: number, total: number) => {
  const r = done / total;
  if (r === 0) return "Início";
  if (r <= 0.2) return "Adaptação";
  if (r < 0.5) return "Alívio e fortalecimento";
  if (r <= 0.6) return "Fase crítica";
  if (r < 1) return "Consolidação";
  return "Conclusão";
};

/** Texto exato para (sessão, total); senão, o equivalente proporcional no plano padrão de 10 sessões. */
export function pickMessage(messages: ProgressEntry[], done: number, total: number): string {
  const exact = messages.find((m) => m.sessionNumber === done && m.totalSessions === total);
  if (exact) return exact.text;
  const scaled = Math.round((done / total) * 10);
  return messages.find((m) => m.sessionNumber === scaled && m.totalSessions === 10)?.text ?? "";
}
