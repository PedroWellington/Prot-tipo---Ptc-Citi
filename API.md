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
| GET | `/api/files/:name` | autenticado | Baixa arquivo enviado (restrito ao paciente dono e à equipe) |
| GET | `/api/desk/agenda` | ADMIN, RECEPCAO | Agenda do dia por unidade |
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
| GET | `/api/physio/treatments/:id` | ADMIN, RECEPCAO, FISIOTERAPEUTA | Detalhe do tratamento (acesso auditado) |
| POST | `/api/physio/treatments/:id/abandon` | ADMIN, FISIOTERAPEUTA | Registra abandono |
| POST | `/api/physio/treatments/:id/script` | ADMIN, FISIOTERAPEUTA | Conclui o roteiro de 1 minuto |
| POST | `/api/physio/treatments/:id/guidance` | ADMIN, FISIOTERAPEUTA | Envia orientação (texto, link ou arquivo em multipart) |
| GET | `/api/cron/tick` | público | Lembretes, atrasos, expirações e fila de e-mail (Bearer CRON_SECRET) |
| POST | `/api/webhooks/pix` | público | Confirmação automática do PSP (exige PIX_PROVIDER=psp e assinatura) |
| GET | `/api/webhooks/whatsapp` | público | Verificação do webhook pela Meta |
| POST | `/api/webhooks/whatsapp` | público | Respostas dos botões do WhatsApp (assinatura da Meta) |
| GET | `/api/admin/dashboard` | ADMIN | Métricas por período e unidade |
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
| GET | `/api/admin/messages` | ADMIN | Textos educativos |
| PATCH | `/api/admin/messages/:id` | ADMIN | Edita texto (incrementa a versão) |
| POST | `/api/admin/demo/reset` | ADMIN | Reseta os dados de demonstração, uma etapa por chamada |
| GET | `/api/admin/audit` | ADMIN | Log de auditoria |
