/**
 * Textos da página pública. Cada campo tem um padrão aqui; o admin muda em Admin > Textos > Página inicial
 * e o valor salvo no banco (SiteContent) substitui o padrão. Conteúdo fictício de demonstração.
 */

export type SiteField = { key: string; section: string; label: string; value: string; long?: boolean };

const f = (section: string, key: string, label: string, value: string, long = false): SiteField => ({ key, section, label, value, long });

export const SITE_FIELDS: SiteField[] = [
  f("Abertura", "hero.titulo", "Título", "Cuidado em fisioterapia, do primeiro dia à alta"),
  f("Abertura", "hero.texto", "Frase", "Avaliação sem pressa, sessões no seu ritmo e acompanhamento até a alta combinada, em Boa Viagem e Casa Forte.", true),

  // Aviso na base da primeira tela, para quem não percebe que a página rola
  f("Cena de abertura", "cena.dica", "Aviso para rolar (computador)", "Role para ver"),
  f("Cena de abertura", "cena.dica.celular", "Aviso para rolar (celular)", "Deslize para ver"),
  // Cada frase aparece ao lado de uma forma feita de partículas, nesta ordem, com um texto curto embaixo
  ...([
    ["Menos faltas.", "coluna vertebral", "Você recebe um lembrete antes de cada sessão e confirma a presença com um toque, pelo celular. Se o horário apertar, troca sem precisar ligar."],
    ["Mais sessões concluídas!", "figura em movimento", "Cada sessão realizada aparece no seu painel, junto com a fase do tratamento. Você vê o caminho que já fez e o que ainda falta."],
    ["Cuidado que acompanha você.", "articulação do joelho", "Entre uma sessão e outra, os exercícios para casa ficam no seu painel, com vídeo ou explicação. A fisioterapeuta acompanha o que você registrou e ajusta o plano."],
    ["Tratamento até o fim.", "anel de progresso", "A dor costuma melhorar antes de a recuperação terminar. Seguir até a última sessão, com a alta combinada com a sua fisioterapeuta, ajuda a evitar que ela volte."],
  ] as const).flatMap(([v, forma, sub], i) => [
    f("Cena de abertura", `cena.${i + 1}`, `Frase ${i + 1}, ao lado da ${forma} (curta, de 2 a 5 palavras)`, v),
    f("Cena de abertura", `cena.${i + 1}.sub`, `Frase ${i + 1}: texto embaixo (2 ou 3 frases curtas)`, sub, true),
  ]),

  f("A clínica", "clinica.titulo", "Título", "Uma clínica feita para você chegar até o fim"),
  f("A clínica", "clinica.p1", "Parágrafo 1", "A Movimento nasceu de uma ideia simples: a fisioterapia funciona melhor quando você entende o próprio tratamento. Cada plano começa com uma avaliação cuidadosa e segue com metas claras, revistas a cada fase.", true),
  f("A clínica", "clinica.p2", "Parágrafo 2", "Você acompanha as sessões pelo celular, confirma presença com um toque e troca de horário sem fila no telefone. A equipe cuida da parte burocrática, como o convênio, para você cuidar da recuperação.", true),

  ...([
    ["coluna", "Coluna e postura", "Dor lombar, cervical e tensão do dia a dia, com foco em postura e fortalecimento do tronco.", "Começamos entendendo o que piora e o que alivia a dor. O plano combina exercícios de controle do tronco, mobilidade e orientações para o trabalho e o sono."],
    ["ombros", "Ombros e membros superiores", "Ombro, cotovelo, punho e mão: dor, rigidez e perda de força.", "Trabalhamos amplitude de movimento e força de forma progressiva, com exercícios que você repete em casa entre as sessões."],
    ["joelhos", "Joelhos e quadril", "Dor ao subir escadas, agachar ou caminhar, e desgaste articular.", "Fortalecimento dos músculos que protegem a articulação, treino de equilíbrio e ajuste gradual das atividades do dia a dia."],
    ["posop", "Reabilitação pós-operatória", "Recuperação depois de cirurgias ortopédicas, no tempo certo de cada fase.", "Seguimos as orientações da equipe cirúrgica: primeiro proteger e controlar a dor, depois recuperar movimento, força e confiança."],
    ["mobilidade", "Mobilidade e prevenção", "Para quem quer se mexer melhor e evitar que dores antigas voltem.", "Exercícios de mobilidade, força e consciência corporal, com um plano de manutenção para seguir depois da alta."],
  ] as const).flatMap(([id, titulo, texto, mais]) => [
    f("Especialidades", `esp.${id}.titulo`, `${titulo}: título`, titulo),
    f("Especialidades", `esp.${id}.texto`, `${titulo}: resumo`, texto, true),
    f("Especialidades", `esp.${id}.mais`, `${titulo}: saiba mais`, mais, true),
  ]),

  f("Nosso espaço", "espaco.titulo", "Título", "Nosso espaço"),
  f("Nosso espaço", "espaco.texto", "Texto", "Salas claras e ventiladas, com equipamentos de exercício terapêutico, macas e área de treino funcional. Cada sessão tem horário reservado para você.", true),
  f("Nosso espaço", "espaco.mais", "Saiba mais", "As cadeiras de atendimento são limitadas por horário, para que a fisioterapeuta acompanhe cada exercício de perto. O espaço é acessível e fica perto de transporte público.", true),
  f("Nosso espaço", "terapia.titulo", "A terapia ideal: título", "A terapia ideal"),
  f("Nosso espaço", "terapia.texto", "A terapia ideal: texto", "Não existe exercício mágico: existe o exercício certo, na dose certa, repetido com regularidade. Por isso cada sessão termina com o que fazer em casa até a próxima.", true),
  f("Nosso espaço", "terapia.mais", "A terapia ideal: saiba mais", "Os exercícios aparecem no seu painel com vídeo ou explicação, e você marca o que já fez. Assim a fisioterapeuta ajusta o plano com base no que realmente aconteceu.", true),

  ...([
    ["Avaliação", "Entendemos sua dor, sua rotina e seus objetivos, e combinamos o plano."],
    ["Sessões", "Em geral 10 sessões, 2 por semana, nos mesmos horários."],
    ["Exercícios em casa", "Orientações curtas para repetir entre as sessões."],
    ["Acompanhamento", "A cada fase, revemos o que melhorou e ajustamos o plano."],
    ["Alta combinada", "Terminamos juntos, com um plano de manutenção."],
  ] as const).flatMap(([titulo, texto], i) => [
    f("Como funciona", `passos.${i + 1}.titulo`, `Passo ${i + 1}: título`, titulo),
    f("Como funciona", `passos.${i + 1}.texto`, `Passo ${i + 1}: texto`, texto, true),
  ]),
  f("Como funciona", "passos.nota", "Por que ir até o fim", "A dor costuma melhorar antes de o tecido terminar de se recuperar. Continuar até a última sessão, mesmo sem dor, é o que evita que ela volte.", true),

  f("Equipe", "equipe.frases", "Apresentações (uma por linha)", "Gosta de explicar o porquê de cada exercício.\nAcompanha de perto quem está voltando a treinar.\nCalma, paciente e atenta aos detalhes da postura.\nDedica-se a quem está se recuperando de cirurgia.\nAcredita que pequenos progressos merecem ser comemorados.", true),

  f("Convênios e pagamento", "convenios.lista", "Convênios aceitos (um por linha)", "Vida Plena Saúde\nNorte Saúde\nMaré Alta Assistência\nBem Cuidar Convênios", true),
  f("Convênios e pagamento", "convenios.texto", "Como funciona o convênio", "O convênio libera as sessões de 5 em 5. Antes de terminarem as 5 primeiras, a clínica já pede a renovação e guarda o seu horário enquanto o convênio analisa.", true),
  f("Convênios e pagamento", "pagamento.texto", "Particular", "Particulares pagam por PIX no momento de agendar. A sessão fica reservada até a confirmação do pagamento.", true),

  ...([
    ["Quanto dura o tratamento?", "Na maioria dos casos, 10 sessões, 2 por semana, cerca de 5 semanas. A fisioterapeuta pode ajustar conforme sua evolução."],
    ["Como troco um horário?", "Pelo app, em Troca: escolha a sessão e o novo horário. A recepção autoriza e seu horário original fica guardado até lá."],
    ["E se eu faltar ou me atrasar?", "Avise pelo app ou pelo lembrete. Faltas criam uma sessão de reposição no fim do plano. Em atrasos longos, o horário pode ser oferecido a quem está na lista de espera."],
    ["Como funciona o convênio?", "O convênio autoriza 5 sessões por vez. Pedimos a renovação antes de acabarem e seus horários ficam guardados enquanto isso."],
    ["Posso mudar de unidade?", "Pode. Em Unidades você vê a mais perto de você e pede a troca para lá."],
    ["Há atendimento aos sábados?", "O atendimento aos sábados está em avaliação. Quando abrir, os horários aparecem no app."],
  ] as const).flatMap(([q, a], i) => [
    f("Perguntas frequentes", `faq.${i + 1}.q`, `Pergunta ${i + 1}`, q),
    f("Perguntas frequentes", `faq.${i + 1}.a`, `Resposta ${i + 1}`, a, true),
  ]),

  f("Faixa em movimento", "faixa.especialidades", "Especialidades e tratamentos (um por linha)", "Coluna e postura\nOmbros\nJoelhos e quadril\nReabilitação pós-operatória\nMobilidade\nPrevenção de dores recorrentes\nExercícios em casa\nAcompanhamento por sessão\nAlta combinada", true),

  f("Sistema por dentro", "tour.titulo", "Título", "Veja o sistema por dentro"),
  f("Sistema por dentro", "tour.sub", "Subtítulo", "O sistema acompanha cada sessão do seu tratamento, do primeiro dia à alta.", true),
  f("Sistema por dentro", "tour.paciente", "O que você faz no sistema (um tópico por linha)", "Acompanhe cada sessão e a fase do tratamento pelo celular.\nConfirme presença ou troque o horário com um toque.\nVeja os exercícios para casa e marque o que já fez.", true),

  f("Subtítulos das seções", "sub.especialidades", "Especialidades", "Planos para as dores mais comuns, com exercícios que você entende e repete em casa.", true),
  f("Subtítulos das seções", "sub.como", "Como funciona", "Um caminho claro, com metas revistas a cada fase.", true),
  f("Subtítulos das seções", "sub.equipe", "Equipe", "Fisioterapeutas que acompanham você do começo ao fim.", true),
  f("Subtítulos das seções", "sub.unidades", "Unidades", "Duas unidades em Recife, perto de transporte público.", true),
  f("Subtítulos das seções", "sub.convenios", "Convênios e pagamento", "Convênio ou particular, sem surpresa na hora de pagar.", true),
  f("Subtítulos das seções", "sub.faq", "Perguntas frequentes", "O que costumam perguntar antes de começar.", true),

  f("Contato", "contato.titulo", "Título", "Pronto para começar?"),
  f("Contato", "contato.texto", "Texto", "Entre ou crie sua conta para escolher os horários. Prefere falar com alguém? Ligue para a unidade.", true),
  f("Contato", "contato.email.BV", "E-mail de Boa Viagem", "boaviagem@movimento.example"),
  f("Contato", "contato.email.CF", "E-mail de Casa Forte", "casaforte@movimento.example"),
];

export const SITE_KEYS = new Set(SITE_FIELDS.map((x) => x.key));

/** Padrões + o que o admin salvou. Chaves desconhecidas no banco são ignoradas. */
export function mergeContent(rows: { key: string; value: string }[]): Record<string, string> {
  const out = Object.fromEntries(SITE_FIELDS.map((x) => [x.key, x.value]));
  for (const r of rows) if (SITE_KEYS.has(r.key) && r.value.trim()) out[r.key] = r.value;
  return out;
}

export const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);

/** Só rotas internas: "/app/agendar" sim; "//site.com", "/\\site.com", "https://…" e a API não. */
export function safeNext(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 200) return null;
  if (!/^\/(?![/\\])[\w\-/?=&.%]*$/.test(raw) || raw.startsWith("/api")) return null;
  return raw;
}

/** "joana.souza@gmail.com" → "jo***@gmail.com" */
export function maskEmail(email: string) {
  const [user, domain] = email.split("@");
  if (!domain) return "***";
  return `${user.slice(0, Math.min(2, Math.max(1, user.length - 1)))}***@${domain}`;
}

export const EMAIL_NOTE = "Use um e-mail de verdade: vamos enviar um código de confirmação para você concluir o cadastro. Se não chegar, olhe a caixa de spam.";

export const RESEND_SECONDS = 60;
/** Segundos até poder reenviar o código (0 = já pode). */
export const resendWait = (lastSentAt: number, now: number) => Math.max(0, Math.ceil((lastSentAt + RESEND_SECONDS * 1000 - now) / 1000));
