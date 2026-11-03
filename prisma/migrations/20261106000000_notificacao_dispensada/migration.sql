-- Notificação apagada no sino: some da lista em todos os dispositivos, mas a linha fica para a fila de e-mail
ALTER TABLE "Notification" ADD COLUMN "dismissedAt" TIMESTAMP(3);
