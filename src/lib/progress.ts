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

export const STAGES = [
  { name: "Início", hint: "Avaliação e primeiros movimentos: o corpo começa a entender o tratamento." },
  { name: "Adaptação", hint: "Pode haver um leve desconforto depois das sessões. É o corpo se ajustando." },
  { name: "Melhora", hint: "A dor costuma diminuir. Continuar agora é o que fixa o resultado." },
  { name: "Consolidação", hint: "Força e estabilidade para a dor não voltar. As sessões finais valem muito." },
  { name: "Alta", hint: "Tratamento concluído. Mantenha os exercícios em casa." },
] as const;

/** Índice em STAGES: Início (0 feitas), Adaptação (até 30%), Melhora (até 60%), Consolidação, Alta (todas). */
export function stageOf(done: number, total: number) {
  const r = total > 0 ? done / total : 0;
  return r === 0 ? 0 : r <= 0.3 ? 1 : r <= 0.6 ? 2 : r < 1 ? 3 : 4;
}

/** Presença (realizadas ÷ realizadas + faltas) e sequência atual de sessões sem falta. Desmarcar com aviso não quebra a sequência. */
export function attendance(sessions: { status: string }[]) {
  const done = sessions.filter((s) => s.status === "REALIZADA").length;
  const missed = sessions.filter((s) => s.status === "FALTA").length;
  let streak = 0;
  for (const s of [...sessions].reverse()) {
    if (s.status === "FALTA") break;
    if (s.status === "REALIZADA") streak++;
  }
  return { presence: done + missed ? Math.round((done / (done + missed)) * 100) : null, streak, missed };
}
