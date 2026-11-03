-- Dor de 0 a 10 por sessão (paciente ou fisioterapeuta) e exercício marcado como feito pelo paciente
ALTER TABLE "Session" ADD COLUMN "painScore" INTEGER;
ALTER TABLE "Guidance" ADD COLUMN "doneAt" TIMESTAMP(3);
