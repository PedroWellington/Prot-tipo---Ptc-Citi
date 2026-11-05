-- Só adiciona: status de pagamento recusado pela equipe e as tabelas dos exercícios prévios genéricos.
ALTER TYPE "PaymentStatus" ADD VALUE 'RECUSADO';

CREATE TABLE "Exercise" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'Leve',
    "prescription" TEXT NOT NULL,
    "rest" TEXT NOT NULL,
    "videoUrl" TEXT,
    "videoChannel" TEXT,
    "generic" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Exercise_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Exercise_slug_key" ON "Exercise"("slug");

CREATE TABLE "ExerciseDone" (
    "patientId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "doneAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExerciseDone_pkey" PRIMARY KEY ("patientId","exerciseId")
);
ALTER TABLE "ExerciseDone" ADD CONSTRAINT "ExerciseDone_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
