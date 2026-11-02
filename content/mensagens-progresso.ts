// Textos educativos por sessão concluída (0 a 10). Estes valores populam a tabela ProgressMessage
// no seed; depois disso o administrador edita pelo painel (Admin > Textos).
export const MENSAGENS_PROGRESSO: Record<number, string> = {
  0: "Seu tratamento começa aqui, e o começo importa. Na primeira sessão, sua fisioterapeuta vai avaliar seus movimentos, entender sua dor e definir os objetivos com você. Venha com roupa confortável e traga suas dúvidas: elas fazem parte do plano.",
  1: "Primeira sessão feita. Seu corpo começou a se adaptar, e é normal sentir um leve incômodo muscular nas próximas horas. Manter o ritmo de duas sessões por semana é o que transforma esse início em resultado.",
  2: "Duas sessões concluídas. Seu corpo já está respondendo aos estímulos, ainda que nem sempre dê para perceber. Nesta fase, a constância vale mais do que a intensidade: cada visita prepara a seguinte.",
  3: "Muita gente começa a sentir menos dor por aqui. Isso é um ótimo sinal de que o tratamento está funcionando, mas ainda não quer dizer que acabou. Até agora trabalhamos principalmente o alívio; o fortalecimento que protege você vem a seguir.",
  4: "Sentir-se melhor é exatamente o que esperávamos neste ponto. A dor diminui antes de os músculos e tecidos estarem prontos para o dia a dia, e é por isso que as próximas sessões contam tanto. É agora que o fortalecimento ganha espaço.",
  5: "Metade do caminho, e uma fase decisiva. Se você usa convênio, esta é a hora da renovação: nossa recepção cuida do pedido, que costuma levar de 3 a 10 dias úteis, e seu horário fica guardado enquanto isso. Você não precisa fazer nada além de continuar vindo.",
  6: "Você passou da metade, e este é o momento em que muita gente pensa em parar porque a dor já não incomoda. Seguir vindo é o que consolida o que você conquistou. Se usa convênio, seu horário continua reservado, e avisaremos assim que a renovação for liberada.",
  7: "A dor pode já ter ido embora, mas o tecido ainda está em recuperação. Ele continua se reorganizando por baixo da melhora que você sente. Interromper agora aumenta o risco de a dor voltar, por isso estas sessões finais são parte do tratamento, não um extra.",
  8: "Faltam duas sessões. Agora o trabalho é deixar seu corpo mais forte e estável para as situações do dia a dia, reduzindo a chance de recaída. Conte à sua fisioterapeuta quais movimentos ainda geram receio: é hora de trabalhar neles.",
  9: "Penúltimo passo concluído. Na próxima sessão vocês vão rever sua evolução e combinar como manter os resultados em casa. Se surgiu alguma dúvida ao longo do tratamento, anote e leve com você.",
  10: "Você concluiu o tratamento, e isso merece reconhecimento. Na conversa de alta, sua fisioterapeuta orienta os exercícios de manutenção e os sinais que pedem atenção. Mantenha a rotina que construiu: ela é o que protege o resultado daqui para a frente.",
};

// Lembrete da fisioterapeuta na 3ª–5ª sessão
export const ROTEIRO_1_MINUTO = [
  "Perguntei como a dor está e reconheci a melhora",
  "Expliquei que menos dor não significa tecido recuperado",
  "Mostrei o que falta: fortalecimento nas próximas sessões",
  "Reforcei o risco de recaída se parar antes da 10ª",
  "Confirmei o próximo horário com o paciente",
];
