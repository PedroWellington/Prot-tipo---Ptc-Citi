# Clínica Movimento

> **Protótipo com dados fictícios.** Pessoas, convênios, telefones e e-mails do seed são inventados. Os endereços das unidades são locais públicos ilustrativos, sem número e sem relação com nenhum estabelecimento. A clínica não é um serviço real em produção. O PIX não confirma sozinho e o WhatsApp é simulado (veja abaixo).

Sistema web de uma rede de fisioterapia com duas unidades em Recife (Boa Viagem e Casa Forte). Ataca as causas reais de abandono do tratamento: progresso visível com mensagens educativas, renovação antecipada do convênio com horário guardado, troca de horário self-service, confirmação interativa, lista de espera e métrica de faltas padronizada.

Stack: Next.js, TypeScript, Tailwind, PostgreSQL, Prisma, TanStack Query, Docker Compose e Mailpit.

## Como rodar (Windows / PowerShell)

Requisito: Docker Desktop aberto.

```powershell
docker compose up --build
```

Sobe app, Postgres e Mailpit, aplica as migrations e roda o seed. A primeira construção pode levar vários minutos.

| Serviço | Endereço |
|---|---|
| App | http://localhost:3000 |
| E-mails capturados (Mailpit) | http://localhost:8025 |
| Postgres (no host) | localhost:5433 |

Para zerar os dados: `docker compose down -v`.

### Desenvolvimento local

```powershell
Copy-Item .env.example .env
docker compose up -d postgres mailpit
npm install
npx prisma migrate deploy
npx prisma db seed
npm run dev
```

## Credenciais de demonstração

Nenhuma senha fica no repositório. Copie `.env.example` para `.env` e defina `ADMIN_PASSWORD` e `DEMO_PASSWORD` antes de subir.

| Perfil | E-mail | Senha |
|---|---|---|
| Administrador | admin@exemplo.test | `ADMIN_PASSWORD` |
| Recepção (Boa Viagem) | recepcao.bv@exemplo.test | `DEMO_PASSWORD` |
| Fisioterapeutas | fisio1 a fisio3 (BV), fisio4 e fisio5 (CF) @exemplo.test | `DEMO_PASSWORD` |
| Pacientes | paciente01 a paciente25 @exemplo.test | `DEMO_PASSWORD` |

Pontos de partida: `paciente01` (onboarding, particular), `paciente04` (convênio na 3ª sessão), `paciente06` (convênio com troca em andamento), `paciente09` (lista de espera).

Os telefones do seed começam com `81 00000`: assinantes iniciados em 0 não existem no plano de numeração, então nenhum número pertence a alguém. O seed cria também 160 pacientes históricos para o dashboard ter 6 meses de dados.

## Mapa de telas

| Perfil | Rotas |
|---|---|
| Público | `/login`, `/cadastro`, `/recuperar`, `/trocar-senha`, `/c/[token]`, `/offline` |
| Paciente | `/app` (Meu tratamento), `/app/mobilidade`, `/app/agendar`, `/app/pagamento/[id]`, `/app/troca`, `/app/unidades`, `/app/perfil` |
| Recepção | `/recepcao` (agenda: dia, semana e mês), `/recepcao/trocas`, `/recepcao/renovacoes`, `/recepcao/espera`, `/recepcao/pagamentos`, `/recepcao/whatsapp`, `/recepcao/pacientes` |
| Fisioterapeuta | `/fisio`, `/fisio/pacientes`, `/fisio/pacientes/[id]` |
| Admin | `/admin` (métricas), `/admin/usuarios`, `/admin/unidades`, `/admin/parametros`, `/admin/textos`, `/admin/auditoria`, e as telas da recepção |

## Unidade sem recepção

Casa Forte começa sem recepção. Enquanto for assim, trocas, renovações, confirmação de PIX e alertas dos pacientes de lá vão para a fisioterapeuta responsável, que ganha essas filas no menu e faz o check-in na própria agenda. Basta cadastrar uma recepcionista na unidade (Admin > Equipe) para tudo voltar a ela, sem nenhuma configuração. Pode haver mais de uma por unidade.

Em Admin > Equipe, "Novo" envia um convite por e-mail para a pessoa criar a própria senha (válido por 7 dias). Desativar e reativar ficam no log de auditoria.

## Interface

Tema claro e escuro com botão em todos os perfis; todo mundo começa no claro, e a escolha fica salva no navegador. A sidebar recolhe pelo botão ou pela tecla `[`, e o M do logo também expande.

## Trocar a cor verde

Altere `--green-*` em [src/styles/tokens.css](src/styles/tokens.css), o único arquivo de cor da marca. Depois ajuste `theme_color` em [src/app/manifest.ts](src/app/manifest.ts) e rode `npm run icons` para regenerar os ícones.

## PIX (particulares)

Ao agendar, o paciente particular recebe um BR Code estático com QR Code e copia e cola. O horário fica reservado por 30 minutos (Admin > Parâmetros). Sem pagamento, a reserva é desfeita sozinha. Convênio não paga: segue o fluxo de renovação.

**Sem provedor, a confirmação é manual.** Um PIX estático não avisa ninguém: a recepção confere o extrato e toca em "Confirmar pagamento" em `/recepcao/pagamentos`. Depois disso o paciente vê "Pago" e recebe o comprovante na tela e por e-mail.

Configure no `.env`, nunca no código:

```
PIX_KEY=sua-chave
PIX_MERCHANT_NAME=Nome do recebedor
PIX_MERCHANT_CITY=Recife
```

Duas implementações de `PaymentProvider` em [src/server/payments/index.ts](src/server/payments/index.ts):

- `StaticPixProvider`: funcionando. Gera o código localmente.
- `PspPixProvider`: adaptador desativado para provedores como Mercado Pago, Efí ou Asaas. Para ligar, use `PIX_PROVIDER=psp`, preencha `PSP_BASE_URL`, `PSP_TOKEN` e `PSP_WEBHOOK_SECRET`, adapte as duas chamadas ao contrato do provedor escolhido e aponte o webhook para `POST /api/webhooks/pix`, com a assinatura HMAC-SHA256 do corpo no cabeçalho `x-webhook-signature`. **Nunca foi testado contra um provedor real.**

Nenhum dado sensível de pagamento é guardado: o código é recalculado a partir do `txid`.

### Tratamento só depois do pagamento autorizado

Enquanto a reserva do particular aguarda pagamento, `/me/home` (abas Tratamento e Mobilidade) devolve **só** o resumo da reserva e o PIX: nada de sessões, gráfico, conquistas ou exercícios, mesmo abrindo a URL ou chamando a API direto. Marcar exercício e registrar dor também respondem 403/409. A tela do paciente consulta a cada 5 s enquanto aguarda e muda sozinha quando a equipe confirma, com o aviso "Pagamento confirmado! Seu tratamento foi liberado". "Agendar mais sessões" num tratamento já pago não bloqueia de novo; convênio nunca bloqueia.

Quem autoriza ou recusa em Pagamentos: o admin (todas as unidades), a recepção da própria unidade e, em unidade sem recepção, o fisioterapeuta responsável. "Recusar pagamento" aceita um motivo opcional, libera os horários na hora (a fila de espera recebe a vaga) e avisa o paciente. Confirmação (`PAGAMENTO_CONFIRMADO`) e recusa (`PAGAMENTO_RECUSADO`, com o motivo) ficam no log de auditoria com quem e quando. Reserva vencida volta o paciente ao início com o aviso de reserva expirada.

## Exercícios prévios (aba Mobilidade)

Paciente com pagamento autorizado (ou convênio) que ainda não recebeu exercícios da fisioterapeuta vê "Exercícios prévios: mobilidade e fortalecimento" no topo da aba Mobilidade e como cartão na aba Tratamento. Quando a fisioterapeuta envia exercícios, eles sobem e a seção desce recolhida. O admin edita nomes, séries, descanso e links em Admin > Textos > Exercícios prévios (só aceita link do YouTube).

Os vídeos abrem no YouTube em nova aba (`rel="noopener noreferrer"`); nada é embutido, sem iframe nem miniatura. Tabelas `Exercise` e `ExerciseDone` (migration aditiva). Para inserir os 6 padrão sem tocar em mais nada:

```
npx tsx --env-file=.env.neon scripts/exercicios-previos.ts
```

Links verificados em 2026-11-05 (existência e canal pelo oEmbed do YouTube; conteúdo pelo título, descrição e capítulos do vídeo):

| Exercício | Vídeo | Canal |
|---|---|---|
| Rotação suave de pescoço | https://www.youtube.com/watch?v=bolyL-Q6KPU | Dr. Robson Sitta (fisioterapeuta, Método Sitta): "mobilidade rotacional da coluna cervical" |
| Círculos de ombro | sem vídeo | Não achei vídeo de profissional de saúde que mostre exatamente este movimento |
| Gato-camelo | https://www.youtube.com/watch?v=IUYz5xHrQNo | Cristiane Lage (fisioterapeuta, BH): "Exercício do gato", flexão e extensão da coluna; orienta não fazer em crise aguda |
| Ponte de glúteos | https://www.youtube.com/watch?v=-Nzmu7H881I | Márcio Brito fisio: passo a passo da ponte |
| Agachamento na parede | https://www.youtube.com/watch?v=bPCnN6zHJEg&t=490s | Fisioterapia com Kelwin Juan: capítulo 08:10 "Agachamento estático na parede" |
| Ativação do quadríceps com toalha | https://www.youtube.com/watch?v=bPCnN6zHJEg&t=165s | Fisioterapia com Kelwin Juan: capítulo 02:45 "Ativação do quadríceps com toalha" |

Os vídeos não foram assistidos quadro a quadro: vale a fisioterapeuta da clínica revisar a execução antes de divulgar.

## WhatsApp e atraso

**Até conectar a API oficial, tudo é simulação: nenhuma mensagem sai da máquina.** As mensagens aparecem em `/recepcao/whatsapp`, a "Caixa do WhatsApp (simulação)", onde dá para responder como o paciente.

Fluxo: passado o horário sem check-in (ou pelo botão "Paciente atrasado"), o paciente e o segundo contato recebem a pergunta. Sem resposta até a tolerância, ou com "Não vou conseguir", a vaga é oferecida à lista de espera daquele horário, em ordem de entrada. O primeiro a confirmar leva; os demais são avisados. Se o paciente chegar antes, o check-in cancela as ofertas. Se chegar depois, a recepção é avisada para reagendar.

Tolerância e espera da vaga são configuradas por unidade em Admin > Unidades. Sem opt-in de WhatsApp, os avisos vão por e-mail e app, e o paciente responde no próprio sistema.

Para conectar o `WhatsAppCloudChannel` (API oficial da Meta), é preciso conta WhatsApp Business, número verificado e templates aprovados com os nomes `atraso_sessao` e `vaga_lista_espera`, cada um com um parâmetro de corpo e botões de resposta rápida. Depois preencha `WHATSAPP_ENABLED=true`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET` e `WHATSAPP_VERIFY_TOKEN`, e aponte o webhook para `/api/webhooks/whatsapp`. **Nunca foi testado contra a Meta.**

## Bairros do Recife

`data/bairros-recife.json` traz os 94 bairros oficiais, com RPA, centroide e polígono simplificado. É gerado por `scripts/gerar-bairros.mjs`.

Fonte: [Dados Abertos do Recife, conjunto "Área urbana", recurso "Bairros do Recife"](https://dados.recife.pe.gov.br/dataset/area-urbana), Prefeitura do Recife, licença [ODbL](http://www.opendefinition.org/licenses/odc-odbl). Os polígonos foram simplificados com tolerância de cerca de 16 m.

As coordenadas do dispositivo ficam só na sessão do navegador e nunca vão para o servidor. Só o bairro é salvo, se o paciente quiser. Sem permissão, ou em HTTP (o navegador só libera a localização em HTTPS ou localhost), a origem é o bairro cadastrado ou escolhido.

## Endereços das unidades

Ajuste em `src/lib/unidades.ts` ou em Admin > Unidades. As coordenadas vêm do [OpenStreetMap](https://www.openstreetmap.org/copyright) (ODbL): `way/174874801` e `way/673898374`. Para atualizar um banco já populado sem rodar o seed e sem apagar nada: `npm run db:unidades`.

## Página pública (/)

A raiz é a página de apresentação da clínica, estática com revalidação a cada 5 minutos (e na hora quando o admin salva um texto em Admin > Textos > Página inicial). Fica fora dos buscadores (`noindex, nofollow`). Os textos padrão estão em `src/lib/site-content.ts`; para gravá-los num banco novo sem tocar em usuários: `npx tsx --env-file=.env.neon scripts/conteudo-site.ts`.

### Imagens da página pública

Nenhuma imagem, texto ou logotipo foi copiado de outros sites. Nenhuma imagem foi gerada por IA.

| Arquivo | Onde | Origem | Autor | Licença |
|---|---|---|---|---|
| `public/site/espaco-*.webp` | Nosso espaço | [Wikimedia Commons: LRMC Physical, Occupational Therapy Clinics… (10036396)](https://commons.wikimedia.org/wiki/File:LRMC_Physical,_Occupational_Therapy_Clinics_Help_Service_Members_Recover,_Return_to_Duty_(10036396).jpg) | Bernhard Lashleyleidner, Exército dos EUA (ID 261020-A-HN506-1013) | Domínio público (obra do governo dos EUA) |
| `public/site/exercicios-*.webp` | A terapia ideal | [Wikimedia Commons: Exercise equipment (rubber ball, light-weight dumbbells, jump rope)](https://commons.wikimedia.org/wiki/File:Exercise_equipment_(rubber_ball,_light-weight_dumbbells,_jump_rope).jpg) | Debora Cartagena, CDC (PHIL #14407) | Domínio público (obra do governo dos EUA) |
| `public/site/tela-*.webp` | Mockups do hero e de "Veja o sistema por dentro" | Capturas do próprio sistema em modo demonstração (dados fictícios, sem CPF, e-mail ou telefone), geradas com Playwright e convertidas por `node scripts/telas-site.mjs <pasta>` | Projeto | Parte do projeto |
| Ilustração de "A clínica" e ícones das especialidades | `src/components/site/illustrations.tsx` | SVG de linha fina original (sem pessoas) e ícones Lucide (licença ISC) | — | Parte do projeto |

Para "A clínica" foi avaliada a foto CC0 [Physical Therapy Teaching Lab at CU Anschutz (October 2025)](https://commons.wikimedia.org/wiki/File:Physical_Therapy_Teaching_Lab_at_CU_Anschutz_(October_2025).jpg) e descartada: mostra pessoas e o logotipo de uma universidade real. No lugar, ilustração de linha.

As licenças foram conferidas foto a foto pela API do Wikimedia Commons (campo `LicenseShortName`). As fotos mostram ambiente e equipamentos, sem pessoas; o uso não indica endosso das instituições de origem. Conversão: `node scripts/imagens-site.mjs <pasta-dos-originais>` gera WebP em 640, 1024 e 1600 px, sem metadados, com dimensões fixas e placeholder desfocado em `src/lib/site-images.ts`.

### Movimento na página pública

Sem biblioteca de animação: CSS e um único `IntersectionObserver` ([src/components/site/motion.tsx](src/components/site/motion.tsx)). Um script inline liga `.motion-ok` antes da primeira pintura só quando há JavaScript e movimento permitido; sem ele (ou com `prefers-reduced-motion`) tudo aparece parado e visível. A faixa em movimento é CSS puro (conteúdo duplicado com `aria-hidden` na cópia), pausa sob o mouse e no foco e só roda visível. Hover (`.lift`) só em `(hover: hover) and (pointer: fine)`; no toque, `scale(0.98)` ao pressionar. Regras em [src/styles/site.css](src/styles/site.css).

A abertura é uma cena rolada ([src/components/site/scene.tsx](src/components/site/scene.tsx)): um palco de ~420vh (340vh no celular) com um quadro `sticky`; a rolagem vira `--p` por `animation-timeline` (ou um único `requestAnimationFrame` passivo onde não há suporte) e move só a esfera (`transform`/`opacity`). As frases (Admin > Textos > Cena de abertura) trocam por quadro, escolhidas por um `IntersectionObserver`. Símbolo da esfera: `SCENE_SYMBOL` (`"m"` ou `"liso"`). Sem JS ou com menos movimento, a cena vira blocos normais com todo o texto.

### Paleta única e fluidez no sistema

Página pública e área logada usam os mesmos tokens ([src/styles/tokens.css](src/styles/tokens.css)): a banda escura do site é o cartão principal do app (`.hero, .site-dark`), a faixa dos números é a faixa de indicadores (`.band, .site-strong`) e a sidebar tem a cor do cabeçalho do site. `tokens.test.ts` confere contraste AA e que nenhum arquivo de estilo/componente alterado tem cor fixa. Dentro do app: troca de rota com `<ViewTransition>` do React (só o conteúdo anima), esqueletos `loading.tsx` no formato de cada tela, indicador deslizante na sidebar e na barra do celular, painéis que fecham com a mesma suavidade com que abrem e itens removidos que saem deslizando ([src/lib/motion.ts](src/lib/motion.ts)).

## Análises: como calculamos as previsões

As contas rodam no servidor da clínica, sem API externa (o assistente com IA só lê os resultados). Funções puras em `src/lib/previsao.ts` (testadas em `previsao.test.ts`); os dados vêm de `src/server/services/analytics.ts`, com cache de 5 minutos.

- **Chance de comparecer** de cada sessão agendada: `p = 1 − taxa de falta do segmento` (tipo de paciente × número da sessão × faixa de horário × unidade), com os últimos 6 meses (o filtro de período troca para 30 ou 90 dias). Taxa = faltas ÷ (realizadas + faltas).
- **Poucos dados**: suavização Beta em cascata. Cada nível é puxado para o pai com peso de 20 sessões: `(faltas + 20 × taxa_do_pai) ÷ (sessões + 20)`, na ordem geral → tipo → tipo + sessão → tipo + sessão + horário + unidade. Usa o segmento mais específico com pelo menos 30 sessões; senão, sobe um nível.
- **Renovação pendente** (sessão pré-reservada de convênio): usa a taxa da 6ª sessão de convênio.
- **Fora da previsão**: sessões com pagamento pendente ou reserva vencida.
- **Mês**: receita = realizadas + Σ valor × p; perda = faltas e desmarcações tardias já ocorridas + Σ valor × (1 − p). Faixas de 80% e 90% por 2.000 sorteios de Bernoulli por sessão (Monte Carlo, ~100 ms). Valores em Admin > Parâmetros (padrão: particular R$ 110, convênio R$ 55).
- **Risco por paciente**: `(faltas + 0,5 × desmarcações tardias + 6 × taxa_do_segmento) ÷ (sessões + 6)`, ajustado por fatores explicáveis (faltou a última ×1,4; 2+ atrasos ×1,15; 2+ trocas ×1,1; 4+ presenças seguidas ×0,75; já confirmou ×0,6), limitado a 2–90%. Só comportamento de atendimento: nada de idade, sexo, bairro, nome ou CPF. Confiança pela amostra (< 3 sessões baixa, < 8 média). Toda consulta fica no log de auditoria.
- **Backtest** (aba Previsões): o modelo é treinado só com o que existia antes de cada semana ou mês passado e comparado com o realizado (MAPE; AUC e acurácia por paciente). O histórico da demonstração é sintético (faltas sorteadas por grupo), então o risco individual quase não supera o do grupo.
- **Assistente**: veja "Assistente com IA gratuita" abaixo. Sem chave de IA, o modo básico entende por regras e dicionário (`src/lib/assistente.ts`, com correção de erros de digitação) e usa os mesmos cálculos.
- **Pelo menos 1 falta** (hoje, amanhã, um período): `1 − Π(1 − taxa de falta de cada sessão agendada)`, com as taxas do modelo acima. A faixa mostrada é de sensibilidade: a mesma conta com as taxas 20% menores e 20% maiores.
- **PNG**: gerado no navegador (canvas, 1200 px × 2), carregado só no clique; nomes de pacientes saem como iniciais salvo "Incluir nomes" (auditado); CPF, telefone e e-mail são filtrados de qualquer texto.
- **Dados de demonstração na Neon**: `npx tsx --env-file=.env.neon scripts/ajustar-demo.ts` (idempotente; só toca usuários `@exemplo.test`).

Previsão estatística com dados fictícios de demonstração, sem garantia de resultado.

## Agenda: dia, semana e mês

Recepção, fisioterapeuta e admin alternam **Dia | Semana | Mês** no topo da agenda (a última escolha fica no navegador). O mês vem de **uma consulta agregada** (`GET /api/agenda/month`: contagens por dia e status, atrasos e renovações pendentes, sem carregar sessão por sessão), com cache de 30 s e o mês seguinte pré-carregado. Dia cheio = 85% ou mais de cadeiras × horas abertas. Unidade, status, busca e fisioterapeuta valem nas três visões. Fisioterapeuta vê só os próprios pacientes, recepção só a própria unidade, admin tudo (`agendaScope` em `src/server/services/agenda.ts`). O paciente vê um mini calendário com as próprias sessões na aba Tratamento.

## Google Agenda (opcional)

**Paciente** (sem login no Google): cada sessão futura tem "Adicionar ao Google Agenda" (link padrão de criação de evento) e um arquivo `.ics` para outros calendários, com lembrete de 1 hora. O evento leva título, data, hora e o endereço público da unidade. Nada de CPF, telefone, e-mail ou observações.

**Equipe** (desligado por padrão): com as variáveis abaixo, o botão "Google Agenda" da tela de Agenda conecta a conta por OAuth 2.0 com PKCE e `state`. O escopo é só `calendar.app.created`: o app cria um calendário dedicado "Clínica Movimento" e mexe apenas nele, sem acesso à agenda pessoal. A sincronização vai do sistema para o Google: depois de cada escrita na API e no cron, cria, atualiza e remove eventos (dos últimos 7 dias aos próximos 60). O id do evento é determinístico, então rodar de novo não duplica. Token expirado é renovado, limite de uso espera e tenta uma vez, e falha vira o aviso "Não foi possível sincronizar" com o botão "Sincronizar agora". O evento mostra só as iniciais ("Sessão - M.S."), a unidade e o horário; "Incluir nome completo" vem desligado. Tokens ficam cifrados (AES-256-GCM) no banco. "Desconectar" revoga o token no Google, apaga os tokens locais e, se marcado, remove o calendário com os eventos. Conexão, desconexão e sincronizações vão para o log de auditoria. A conexão é por usuário: cada um sincroniza a própria agenda (fisioterapeuta: os próprios pacientes; recepção: a unidade; admin: tudo).

Como configurar (sem segredos no repositório):

1. No [Google Cloud Console](https://console.cloud.google.com/), crie um projeto e ative a **Google Calendar API**.
2. **Tela de consentimento OAuth**: tipo Externo, em **modo de teste**, adicione os e-mails da equipe como **usuários de teste** e inclua o escopo `.../auth/calendar.app.created`.
3. **Credenciais → Criar ID do cliente OAuth → Aplicativo da Web**. Em "URIs de redirecionamento autorizados", coloque `https://SEU-DOMINIO/api/google/callback` (e `http://localhost:3000/api/google/callback` para desenvolvimento).
4. No `.env` local e nas variáveis da Vercel: `GOOGLE_CALENDAR_ENABLED=true`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` (a mesma URI do passo 3) e `GOOGLE_TOKEN_KEY` (gere com `openssl rand -base64 48`). Sem elas, o botão aparece desabilitado com "Integração com Google Agenda não configurada".

## Assistente com IA gratuita

O campo aceita qualquer pergunta sobre os dados da clínica. Um modelo **Llama na Groq** (plano gratuito, API no formato da OpenAI) entende a pergunta e chama **ferramentas de leitura** do servidor (`src/server/assistant/tools.ts`): faltas por período, previsão de faltas, receita e perda, risco de um paciente, pacientes de maior risco, sessões do dia, ocupação, renovações, lista de espera, trocas, pagamentos pendentes, horários livres, comparação e simulação. Os parâmetros são validados com Zod e as contas são as mesmas das abas Financeiro e Previsões. **O modelo não recebe o banco e não faz contas**: todo número da resposta é conferido contra os resultados das ferramentas; se aparecer um número que não veio delas, o servidor pede para reescrever e, se insistir, responde no modo básico.

- **Modelos** (documentação da Groq em novembro de 2026): `ASSISTANT_MODEL=llama-3.3-70b-versatile` (principal, com tool calling) e `ASSISTANT_MODEL_FALLBACK=llama-3.1-8b-instant` (menor e mais rápido). Temperatura 0,1, no máximo 4 rodadas de ferramentas, 600 tokens por resposta, 12 s por chamada.
- **Cadeia de reservas**: erro 429 → espera curta e tenta de novo → modelo menor → Gemini (se `GEMINI_API_KEY` existir; desligado por padrão) → modo básico, com o aviso "Limite gratuito atingido, usando modo básico". Sem chave, ou com `ASSISTANT_PROVIDER=local`, tudo roda no modo básico.
- **Limites para não estourar a cota**: 6 perguntas por minuto e 60 por dia por pessoa, `ASSISTANT_DAILY_LIMIT` no total do dia (padrão 300), e respostas idênticas ficam 5 min em cache. Admin > Parâmetros mostra a IA ativa, a reserva, o uso do dia e o limite.
- **Respostas**: as etapas ("Consultando previsão de faltas…") chegam em streaming; o texto aparece depois de conferido. Fora do tema, a resposta é exatamente "Não consigo responder essa pergunta com base nos dados cadastrados no sistema.", com 3 sugestões.

**O que vai para o provedor de IA**: a pergunta digitada, as perguntas e respostas anteriores da mesma conversa (com pacientes em iniciais) e os resultados agregados das ferramentas: contagens, taxas, valores em reais, datas, nomes de unidades e pacientes como iniciais + identificador interno (ex.: `M.S. (P-abcdef)`). O nome completo é trocado só no servidor, na resposta final para admin e recepção. **Nunca vai**: CPF, telefone, e-mail, endereço, convênio/carteirinha, dor ou observações clínicas. Uma última barreira (`sanitize`) remove essas chaves e qualquer texto com cara de CPF, telefone ou e-mail. Texto do banco e do usuário é tratado como dado, nunca como instrução, e só existem ferramentas de leitura. Cada consulta vai para o log de auditoria (usuário, pergunta, ferramentas, provedor), sem os dados devolvidos.

**Política de dados do plano gratuito** (conferida em novembro de 2026; confira de novo antes de usar dados reais):

- **Groq**: segundo [console.groq.com/docs/your-data](https://console.groq.com/docs/your-data), entradas e saídas de inferência **não ficam guardadas por padrão**; podem ser registradas por até 30 dias só para investigar erros de confiabilidade ou abuso, e dá para ligar a Retenção Zero (ZDR) em Data Controls. A página não diz se os dados servem para treino.
- **Gemini**: no plano gratuito, o Google pode usar o conteúdo para melhorar seus produtos, e revisores humanos podem ler. Por isso fica desligado por padrão.
- Neste protótipo só vão **dados fictícios de demonstração, agregados**. Com dados reais de pacientes, use plano pago com contrato de tratamento de dados (LGPD) ou o modo básico.

**Chave gratuita da Groq**: entre em [console.groq.com](https://console.groq.com/), crie uma conta, abra **API Keys → Create API Key** e coloque o valor em `GROQ_API_KEY` no `.env` e nas variáveis da Vercel (só no servidor; nunca no repositório nem em variável `NEXT_PUBLIC_`). Gemini (opcional): chave em [aistudio.google.com](https://aistudio.google.com/apikey), em `GEMINI_API_KEY`.

## Decisões técnicas

- **Camadas:** `src/server/api/routes.ts` (tabela de rotas com perfis e Zod) → `services/` (regras) → `repositories/` (Prisma). Regras puras e testadas ficam em `src/lib/`.
- **Dupla reserva:** lock consultivo do Postgres por unidade + índices únicos parciais na migration (`session_physio_slot`, `session_patient_slot`). A mesma trava decide a disputa pela vaga.
- **Pré-reserva do convênio:** as sessões 6 a 10 já existem com `provisional = true`, ocupando a agenda até a recepção decidir. Sessões extras reabrem a renovação.
- **Pagamento e presença são coisas diferentes:** sem pagamento, a sessão não pode ser confirmada nem trocada. Depois de pago, o paciente continua recebendo o lembrete para confirmar presença.
- **Falta:** a sessão perdida não conta, as seguintes assumem o número e uma reposição entra ao fim do plano.
- **Navegação:** um layout único em `src/app/(shell)` mantém sidebar e topo montados. Rotas do menu têm prefetch completo e ficam 5 min no cache do cliente; os dados das abas são pré-carregados (`src/lib/queries.ts`).
- **Tempo real:** polling do TanStack Query, mais rápido enquanto há algo pendente e pausado em aba oculta.
- **Links de e-mail:** abrir o link não executa nada; a ação exige um toque. Antivírus de e-mail abrem links sozinhos.
- **Agendador:** `setInterval` no próprio processo (`src/instrumentation.ts`). Com mais de uma instância, rode em só uma.
- **Gráficos:** barras em CSS, sem biblioteca. Framer Motion, Leaflet e bairros só carregam quando usados.
- **Bcrypt:** `bcryptjs`, mesmo algoritmo sem compilação nativa.

## Deploy na Vercel com Neon

1. Importe o repositório na Vercel. O `vercel.json` coloca as funções em São Paulo, perto do banco.
2. Cadastre as variáveis de ambiente do `.env.example`. Em `DATABASE_URL` use a string com pooler da Neon; em `DIRECT_URL`, a direta.
3. Aplique migrations e seed a partir da sua máquina, com as variáveis da Neon no ambiente do comando. A Vercel não roda nada disso sozinha.
4. E-mail: qualquer SMTP serve (na Brevo, `smtp-relay.brevo.com`, porta 587, com o remetente verificado).

**Limites na Vercel:**

- Sem processo contínuo, lembretes, atrasos e expirações só rodam quando `GET /api/cron/tick` é chamado, com `Authorization: Bearer <CRON_SECRET>`. No plano Hobby o cron da Vercel é diário: para o fluxo de atraso em tempo real, aponte um agendador externo para essa rota a cada minuto.
- Envio de arquivo pela fisioterapeuta fica desligado, porque o disco é efêmero. Links funcionam.

O botão **Resetar dados de demonstração** fica em Admin > Parâmetros e só aparece com `NEXT_PUBLIC_DEMO_MODE=true` no build.

## Produção

Com `APP_ENV=production`: sem dados demo, troca de senha obrigatória no primeiro login do admin e sessões só podem ser marcadas como realizadas no próprio dia. O cookie é `Secure` sempre que `APP_URL` for HTTPS. Gere um `JWT_SECRET` novo, use HTTPS e criptografe o CPF em repouso antes de lidar com dados reais.

## Qualidade

```powershell
npm run lint; npm run typecheck; npm test; npm run build
node scripts/fumaca.mjs   # ponta a ponta contra o app rodando, em banco de demonstração
```

Documentação da API: [API.md](API.md).
