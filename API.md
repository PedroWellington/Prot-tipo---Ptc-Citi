# API da Clínica Movimento

Gerado por `npm run docs:api` a partir de `src/server/api/routes.ts`, onde cada rota declara perfis, schema Zod e limite de requisições.

- Autenticação: cookie httpOnly `mv_session` (JWT HS256), obtido em `POST /api/auth/login`.
- Escritas aceitam só a própria origem (cabeçalho `Origin`).
- Erros: `{ "error": { "code", "message", "fields?" } }`, com 401, 403, 404, 409, 422, 423 ou 429.
- Paginação: `take` (máx. 100) e `skip`, com `q` para busca onde indicado.

| Método | Rota | Perfis | Descrição |
|---|---|---|---|
| GET | `/api/auth/me` | público | Usuário da sessão atual |
| POST | `/api/auth/login` | público | Entrar com e-mail e senha (limite 20/60s) |
| POST | `/api/auth/logout` | público | Sair |
| POST | `/api/auth/register/start` | público | Valida dados e envia o código por e-mail (limite 5/300s) |
| POST | `/api/auth/register/resend` | público | Reenvia o código (mínimo de 60 s entre envios) (limite 5/300s) |
| POST | `/api/auth/register/verify` | público | Confere o código de 6 dígitos (limite 10/60s) |
| POST | `/api/auth/register/complete` | público | Define a senha, com confirmação, e cria a conta (limite 10/60s) |
| POST | `/api/auth/forgot` | público | Envia código de redefinição (limite 5/300s) |
| POST | `/api/auth/reset` | público | Redefine a senha com o código e a confirmação (limite 10/60s) |
| POST | `/api/auth/password` | autenticado | Troca a senha (limite 10/60s) |
| GET | `/api/units` | público | Unidades ativas (dados quase estáticos) |
| GET | `/api/confirm/:token` | público | Dados do link de confirmação (limite 30/60s) |
| POST | `/api/confirm/:token` | público | Executa a ação do link (uso único) (limite 10/60s) |
| GET | `/api/me/home` | PACIENTE | Dados da tela Meu tratamento |
| POST | `/api/me/sessions/:id/confirm` | PACIENTE | Confirma presença |
| POST | `/api/me/sessions/:id/pain` | PACIENTE | Registra a dor de hoje (0 a 10) |
| POST | `/api/me/guidances/:id/done` | PACIENTE | Marca exercício como feito |
| POST | `/api/me/exercises/:id/done` | PACIENTE | Marca exercício prévio (genérico) como feito |
| GET | `/api/me/units` | PACIENTE | Unidades com horários dos próximos 7 dias |
| GET | `/api/slots` | PACIENTE, ADMIN, RECEPCAO | Horários livres de uma unidade |
| GET | `/api/week-grid` | PACIENTE, ADMIN, RECEPCAO | Grade semanal para o wizard de agendamento |
| GET | `/api/me/booking-info` | PACIENTE | Tipo do paciente e preço da sessão |
| POST | `/api/me/treatment` | PACIENTE | Agenda novo pacote ou sessão avulsa (particular gera cobrança PIX) (limite 10/60s) |
| GET | `/api/me/requests` | PACIENTE | Solicitações de troca do paciente |
| POST | `/api/me/requests` | PACIENTE | Solicita troca de horário |
| POST | `/api/me/requests/:id/cancel` | PACIENTE | Cancela a solicitação pendente |
| GET | `/api/me/waitlist` | PACIENTE | Lista de espera do paciente |
| POST | `/api/me/waitlist` | PACIENTE | Entra na lista de espera |
| POST | `/api/me/waitlist/:id/accept` | PACIENTE | Aceita a vaga ofertada |
| DELETE | `/api/me/waitlist/:id` | PACIENTE | Sai da lista de espera |
| GET | `/api/me/payments` | PACIENTE | Pagamentos do paciente |
| GET | `/api/me/payments/:id` | PACIENTE | Cobrança PIX: código, QR Code, status e recibo |
| POST | `/api/me/late/:id/reply` | PACIENTE | Responde ao aviso de atraso pelo app |
| GET | `/api/me/late-offers` | PACIENTE | Vagas de hoje ofertadas ao paciente |
| POST | `/api/me/late-offers/:id/reply` | PACIENTE | Aceita ou recusa a vaga (primeiro a confirmar leva) |
| GET | `/api/me/profile` | PACIENTE | Perfil com CPF mascarado |
| PATCH | `/api/me/profile` | PACIENTE | Atualiza perfil e preferências |
| GET | `/api/me/export` | PACIENTE | Baixa os dados pessoais (LGPD) |
| POST | `/api/me/delete` | PACIENTE | Exclui a conta (LGPD) (limite 10/60s) |
| GET | `/api/notifications` | autenticado | Notificações e contador de não lidas |
| POST | `/api/notifications/read` | autenticado | Marca como lida (uma ou todas) |
| POST | `/api/notifications/dismiss` | autenticado | Apaga do sino (uma ou todas) |
| GET | `/api/files/:name` | autenticado | Baixa arquivo enviado (restrito ao paciente dono e à equipe) |
| GET | `/api/desk/agenda` | ADMIN, RECEPCAO | Agenda do dia (ou da semana, dias=7) por unidade; recepção só a própria |
| GET | `/api/agenda/month` | ADMIN, RECEPCAO, FISIOTERAPEUTA | Mês da agenda: contagens por dia e status (uma consulta agregada) |
| GET | `/api/desk/requests` | ADMIN, RECEPCAO, FISIOTERAPEUTA | Fila de solicitações com conflitos e alternativas |
| POST | `/api/desk/requests/:id/approve` | ADMIN, RECEPCAO, FISIOTERAPEUTA | Aprova a troca |
| POST | `/api/desk/requests/:id/reject` | ADMIN, RECEPCAO, FISIOTERAPEUTA | Recusa com justificativa e sugestão |
| GET | `/api/desk/renewals` | ADMIN, RECEPCAO, FISIOTERAPEUTA | Fila de renovações de convênio |
| PATCH | `/api/desk/renewals/:id` | ADMIN, RECEPCAO, FISIOTERAPEUTA | Atualiza status, prazo e observação |
| POST | `/api/desk/renewals/:id/release` | ADMIN, RECEPCAO, FISIOTERAPEUTA | Solta os horários pré-reservados |
| GET | `/api/desk/waitlist` | ADMIN, RECEPCAO | Lista de espera |
| DELETE | `/api/desk/waitlist/:id` | ADMIN, RECEPCAO | Remove da lista de espera |
| GET | `/api/desk/patients` | ADMIN, RECEPCAO, FISIOTERAPEUTA | Busca de pacientes |
| POST | `/api/desk/patients` | ADMIN, RECEPCAO | Cadastra paciente (CPF + e-mail) (limite 20/60s) |
| POST | `/api/desk/patients/:id/treatment` | ADMIN, RECEPCAO | Agenda em nome do paciente |
| GET | `/api/desk/payments` | ADMIN, RECEPCAO, FISIOTERAPEUTA | Pagamentos aguardando confirmação |
| POST | `/api/desk/payments/:id/confirm` | ADMIN, RECEPCAO, FISIOTERAPEUTA | Confirma o PIX manualmente |
| POST | `/api/desk/payments/:id/reject` | ADMIN, RECEPCAO, FISIOTERAPEUTA | Recusa o pagamento: libera os horários e avisa o paciente |
| POST | `/api/desk/payments/:id/reactivate` | ADMIN, RECEPCAO, FISIOTERAPEUTA | Reativa uma reserva de PIX vencida se os horários continuam livres |
| POST | `/api/desk/sessions/:id/checkin` | ADMIN, RECEPCAO, FISIOTERAPEUTA | Check-in; cancela ofertas de vaga pendentes |
| POST | `/api/desk/sessions/:id/late` | ADMIN, RECEPCAO | Paciente atrasado: inicia o fluxo manualmente |
| GET | `/api/desk/sessions/:id/late` | ADMIN, RECEPCAO | Linha do tempo do atraso |
| GET | `/api/desk/whatsapp` | ADMIN, RECEPCAO | Caixa do WhatsApp |
| POST | `/api/desk/whatsapp/:id/reply` | ADMIN, RECEPCAO | Responde como o paciente (só no modo simulado) |
| POST | `/api/desk/sessions/:id/confirm` | ADMIN, RECEPCAO | Confirma presença em nome do paciente |
| POST | `/api/desk/sessions/:id/miss` | ADMIN, RECEPCAO | Registra falta ou desmarcação |
| GET | `/api/physio/agenda` | ADMIN, FISIOTERAPEUTA | Agenda própria do dia |
| POST | `/api/physio/sessions/:id/done` | ADMIN, FISIOTERAPEUTA | Marca sessão como realizada |
| POST | `/api/physio/sessions/:id/miss` | ADMIN, FISIOTERAPEUTA | Registra falta ou desmarcação com motivo |
| POST | `/api/physio/sessions/:id/pain` | ADMIN, FISIOTERAPEUTA | Registra a dor relatada na sessão (0 a 10) |
| GET | `/api/physio/treatments/:id` | ADMIN, RECEPCAO, FISIOTERAPEUTA | Detalhe do tratamento (acesso auditado) |
| POST | `/api/physio/treatments/:id/abandon` | ADMIN, FISIOTERAPEUTA | Registra abandono |
| POST | `/api/physio/treatments/:id/script` | ADMIN, FISIOTERAPEUTA | Conclui o roteiro de 1 minuto |
| POST | `/api/physio/treatments/:id/guidance` | ADMIN, FISIOTERAPEUTA | Envia orientação (texto, link ou arquivo em multipart) |
| GET | `/api/google/status` | ADMIN, RECEPCAO, FISIOTERAPEUTA | Estado da conexão com o Google Agenda (sem tokens) |
| GET | `/api/google/connect` | ADMIN, RECEPCAO, FISIOTERAPEUTA | Inicia o OAuth 2.0 (PKCE + state, escopo calendar.app.created) (limite 10/60s) |
| GET | `/api/google/callback` | ADMIN, RECEPCAO, FISIOTERAPEUTA | Volta do Google: confere state, troca o código e cria o calendário dedicado (limite 10/60s) |
| POST | `/api/google/sync` | ADMIN, RECEPCAO, FISIOTERAPEUTA | Sincronizar agora (limite 6/60s) |
| PATCH | `/api/google/settings` | ADMIN, RECEPCAO, FISIOTERAPEUTA | Incluir nome completo nos eventos (padrão: só iniciais) |
| POST | `/api/google/disconnect` | ADMIN, RECEPCAO, FISIOTERAPEUTA | Revoga o token e apaga a conexão (opcional: remove os eventos) |
| GET | `/api/cron/tick` | público | Lembretes, atrasos, expirações e fila de e-mail (Bearer CRON_SECRET) |
| POST | `/api/webhooks/pix` | público | Confirmação automática do PSP (exige PIX_PROVIDER=psp e assinatura) |
| GET | `/api/webhooks/whatsapp` | público | Verificação do webhook pela Meta |
| POST | `/api/webhooks/whatsapp` | público | Respostas dos botões do WhatsApp (assinatura da Meta) |
| GET | `/api/admin/dashboard` | ADMIN | Métricas por período e unidade |
| GET | `/api/analytics/financeiro` | ADMIN, RECEPCAO | Receita realizada, prevista e perda do mês, com faixa de confiança |
| GET | `/api/analytics/previsoes` | ADMIN, RECEPCAO | Faltas previstas e risco por paciente (consulta auditada) |
| GET | `/api/analytics/backtest` | ADMIN, RECEPCAO | Previsto x realizado em semanas e meses passados |
| POST | `/api/analytics/assistente` | ADMIN, RECEPCAO | Assistente (IA gratuita com ferramentas de leitura, ou modo básico): resposta em NDJSON com etapas e o resultado final (limite 30/60s) |
| GET | `/api/admin/assistente` | ADMIN | Estado do assistente: IA ativa, reserva, uso do dia e limite (sem chaves) |
| GET | `/api/analytics/assistente/inicio` | ADMIN, RECEPCAO | Nomes para as sugestões e o autocompletar (só nomes) |
| POST | `/api/analytics/export-audit` | ADMIN, RECEPCAO | Registra exportação de PNG com nomes de pacientes |
| POST | `/api/desk/sessions/:id/remind` | ADMIN, RECEPCAO | Envia lembrete agora (app, e-mail e WhatsApp simulado) |
| GET | `/api/admin/site-content` | ADMIN | Textos da página pública |
| PATCH | `/api/admin/site-content/:key` | ADMIN | Altera um texto da página pública e a publica |
| GET | `/api/admin/export.csv` | ADMIN | Relatório de sessões em CSV (sem dados pessoais) |
| GET | `/api/admin/users` | ADMIN | Equipe |
| POST | `/api/admin/users` | ADMIN | Cria recepção ou fisioterapeuta e envia convite por e-mail |
| DELETE | `/api/admin/users/:id` | ADMIN | Desativa usuário da equipe |
| POST | `/api/admin/users/:id/reactivate` | ADMIN | Reativa usuário da equipe |
| GET | `/api/admin/units` | ADMIN | Unidades completas |
| PATCH | `/api/admin/units/:id` | ADMIN | Edita unidade, cadeiras, horários e sábado |
| GET | `/api/admin/holidays` | ADMIN | Feriados |
| POST | `/api/admin/holidays` | ADMIN | Cadastra feriado |
| DELETE | `/api/admin/holidays/:id` | ADMIN | Remove feriado |
| GET | `/api/admin/settings` | ADMIN | Parâmetros |
| PATCH | `/api/admin/settings` | ADMIN | Atualiza parâmetros |
| GET | `/api/admin/exercises` | ADMIN | Exercícios prévios (genéricos) |
| PATCH | `/api/admin/exercises/:id` | ADMIN | Edita um exercício prévio e o link do vídeo |
| GET | `/api/admin/messages` | ADMIN | Textos educativos |
| PATCH | `/api/admin/messages/:id` | ADMIN | Edita texto (incrementa a versão) |
| POST | `/api/admin/demo/reset` | ADMIN | Reseta os dados de demonstração, uma etapa por chamada |
| GET | `/api/admin/audit` | ADMIN | Log de auditoria |
