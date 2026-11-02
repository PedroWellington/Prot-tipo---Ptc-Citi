export const SESSION_STATUS: Record<string, { label: string; tone: Tone }> = {
  AGENDADA: { label: "Agendada", tone: "neutral" },
  CONFIRMADA: { label: "Confirmada", tone: "accent" },
  REALIZADA: { label: "Realizada", tone: "ok" },
  FALTA: { label: "Falta", tone: "danger" },
  DESMARCADA: { label: "Desmarcada", tone: "warn" },
  REAGENDADA: { label: "Reagendada", tone: "neutral" },
};

export type Tone = "neutral" | "accent" | "ok" | "warn" | "danger";

export const MISS_REASON_LABELS: Record<string, string> = {
  ALIVIO_DOR: "Sentiu alívio da dor",
  HORARIO: "Conflito de horário",
  TRANSPORTE: "Transporte ou deslocamento",
  CONVENIO: "Autorização do convênio",
  SAUDE: "Outro problema de saúde",
  FINANCEIRO: "Questão financeira",
  ESQUECIMENTO: "Esqueceu",
  ATRASO: "Atraso",
  OUTRO: "Outro motivo",
};

export const LATE_STATUS: Record<string, string> = {
  AGUARDANDO: "Atrasado", A_CAMINHO: "A caminho", DESISTIU: "Não vem", OFERTADA: "Vaga ofertada",
  PREENCHIDA: "Vaga preenchida", CHEGOU: "Chegou atrasado", ENCERRADA: "Atraso encerrado",
};

export const LATE_STEP: Record<string, string> = {
  ATRASO_DETECTADO: "Atraso detectado",
  ATRASO_MARCADO_RECEPCAO: "Marcado pela recepção",
  ATRASO_WHATSAPP_ENVIADO: "WhatsApp enviado",
  ATRASO_AVISO_APP_ENVIADO: "Aviso por e-mail e app (sem opt-in)",
  PACIENTE_A_CAMINHO: "Paciente a caminho",
  PACIENTE_NAO_VEM: "Paciente não vem",
  PACIENTE_CHEGOU: "Paciente chegou",
  VAGA_OFERTADA: "Vaga ofertada à lista de espera",
  VAGA_RECUSADA: "Oferta recusada",
  VAGA_PREENCHIDA: "Vaga preenchida",
  VAGA_NAO_PREENCHIDA: "Ninguém aceitou a vaga",
  VAGA_SEM_LISTA_DE_ESPERA: "Sem lista de espera neste horário",
  CHEGOU_APOS_VAGA_PREENCHIDA: "Chegou após a vaga ser preenchida",
  ATRASO_RESOLVIDO_SEM_VAGA: "Atendido dentro da tolerância",
};

export const RENEWAL_LABEL: Record<string, string> = {
  NAO_INICIADA: "Não iniciada",
  SOLICITADA: "Solicitada",
  EM_ANALISE: "Em análise",
  LIBERADA: "Liberada",
  NEGADA: "Negada",
};

export const REQUEST_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDENTE: { label: "Em andamento", tone: "warn" },
  APROVADA: { label: "Aprovada", tone: "ok" },
  RECUSADA: { label: "Recusada", tone: "danger" },
  CANCELADA: { label: "Cancelada", tone: "neutral" },
};

export const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Administrador", RECEPCAO: "Recepção", FISIOTERAPEUTA: "Fisioterapeuta", PACIENTE: "Paciente",
};

export const formatPhone = (v: string) => v.replace(/^(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3");
export const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
