# Clínica Movimento

> **Protótipo com dados fictícios.** Pessoas, convênios, telefones, e-mails e endereços do seed são inventados. A clínica não é um serviço real em produção. O PIX não confirma sozinho e o WhatsApp é simulado (veja abaixo).

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
| Paciente | `/app` (Meu tratamento), `/app/agendar`, `/app/pagamento/[id]`, `/app/troca`, `/app/unidades`, `/app/perfil` |
| Recepção | `/recepcao` (dia), `/recepcao/trocas`, `/recepcao/renovacoes`, `/recepcao/espera`, `/recepcao/pagamentos`, `/recepcao/whatsapp`, `/recepcao/pacientes` |
| Fisioterapeuta | `/fisio`, `/fisio/pacientes`, `/fisio/pacientes/[id]` |
| Admin | `/admin` (métricas), `/admin/usuarios`, `/admin/unidades`, `/admin/parametros`, `/admin/textos`, `/admin/auditoria`, e as telas da recepção |

## Unidade sem recepção

Casa Forte começa sem recepção. Enquanto for assim, trocas, renovações, confirmação de PIX e alertas dos pacientes de lá vão para a fisioterapeuta responsável, que ganha essas filas no menu e faz o check-in na própria agenda. Basta cadastrar uma recepcionista na unidade (Admin > Equipe) para tudo voltar a ela, sem nenhuma configuração. Pode haver mais de uma por unidade.

Em Admin > Equipe, "Novo" envia um convite por e-mail para a pessoa criar a própria senha (válido por 7 dias). Desativar e reativar ficam no log de auditoria.

## Interface

Tema claro e escuro com botão em todos os perfis; a primeira visita segue o sistema. A sidebar recolhe pelo botão ou pela tecla `[`, e o M do logo também expande.

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

## WhatsApp e atraso

**Até conectar a API oficial, tudo é simulação: nenhuma mensagem sai da máquina.** As mensagens aparecem em `/recepcao/whatsapp`, a "Caixa do WhatsApp (simulação)", onde dá para responder como o paciente.

Fluxo: passado o horário sem check-in (ou pelo botão "Paciente atrasado"), o paciente e o segundo contato recebem a pergunta. Sem resposta até a tolerância, ou com "Não vou conseguir", a vaga é oferecida à lista de espera daquele horário, em ordem de entrada. O primeiro a confirmar leva; os demais são avisados. Se o paciente chegar antes, o check-in cancela as ofertas. Se chegar depois, a recepção é avisada para reagendar.

Tolerância e espera da vaga são configuradas por unidade em Admin > Unidades. Sem opt-in de WhatsApp, os avisos vão por e-mail e app, e o paciente responde no próprio sistema.

Para conectar o `WhatsAppCloudChannel` (API oficial da Meta), é preciso conta WhatsApp Business, número verificado e templates aprovados com os nomes `atraso_sessao` e `vaga_lista_espera`, cada um com um parâmetro de corpo e botões de resposta rápida. Depois preencha `WHATSAPP_ENABLED=true`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET` e `WHATSAPP_VERIFY_TOKEN`, e aponte o webhook para `/api/webhooks/whatsapp`. **Nunca foi testado contra a Meta.**

## Bairros do Recife

`data/bairros-recife.json` traz os 94 bairros oficiais, com RPA, centroide e polígono simplificado. É gerado por `scripts/gerar-bairros.mjs`.

Fonte: [Dados Abertos do Recife, conjunto "Área urbana", recurso "Bairros do Recife"](https://dados.recife.pe.gov.br/dataset/area-urbana), Prefeitura do Recife, licença [ODbL](http://www.opendefinition.org/licenses/odc-odbl). Os polígonos foram simplificados com tolerância de cerca de 16 m.

As coordenadas do dispositivo ficam só na sessão do navegador e nunca vão para o servidor. Só o bairro é salvo, se o paciente quiser. Sem permissão, ou em HTTP (o navegador só libera a localização em HTTPS ou localhost), a origem é o bairro cadastrado ou escolhido.

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
