-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('AGUARDANDO', 'PAGO', 'EXPIRADO');

-- CreateEnum
CREATE TYPE "LateStatus" AS ENUM ('AGUARDANDO', 'A_CAMINHO', 'DESISTIU', 'OFERTADA', 'PREENCHIDA', 'CHEGOU', 'ENCERRADA');

-- CreateEnum
CREATE TYPE "LateOfferStatus" AS ENUM ('ENVIADA', 'ACEITA', 'RECUSADA', 'ENCERRADA');

-- AlterTable
ALTER TABLE "PatientProfile" ADD COLUMN     "bairro" TEXT,
ADD COLUMN     "whatsappOptIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "whatsappOptInAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "checkedInAt" TIMESTAMP(3),
ADD COLUMN     "lateAt" TIMESTAMP(3),
ADD COLUMN     "paymentId" TEXT;

-- AlterTable
ALTER TABLE "Unit" ADD COLUMN     "lateToleranceMin" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "slotHoldMin" INTEGER NOT NULL DEFAULT 10;

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "treatmentId" TEXT,
    "createdTreatment" BOOLEAN NOT NULL DEFAULT false,
    "amountCents" INTEGER NOT NULL,
    "sessionCount" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'AGUARDANDO',
    "provider" TEXT NOT NULL,
    "txid" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LateEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "status" "LateStatus" NOT NULL DEFAULT 'AGUARDANDO',
    "etaMinutes" INTEGER,
    "deadlineAt" TIMESTAMP(3) NOT NULL,
    "offerEndsAt" TIMESTAMP(3),
    "filledBySessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "LateEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LateOffer" (
    "id" TEXT NOT NULL,
    "lateEventId" TEXT NOT NULL,
    "waitlistEntryId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "status" "LateOfferStatus" NOT NULL DEFAULT 'ENVIADA',
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "LateOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "contact" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "buttons" JSONB,
    "kind" TEXT NOT NULL,
    "refId" TEXT,
    "simulated" BOOLEAN NOT NULL DEFAULT true,
    "externalId" TEXT,
    "reply" TEXT,
    "repliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_txid_key" ON "Payment"("txid");

-- CreateIndex
CREATE INDEX "Payment_status_expiresAt_idx" ON "Payment"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Payment_patientId_createdAt_idx" ON "Payment"("patientId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LateEvent_sessionId_key" ON "LateEvent"("sessionId");

-- CreateIndex
CREATE INDEX "LateEvent_status_deadlineAt_idx" ON "LateEvent"("status", "deadlineAt");

-- CreateIndex
CREATE INDEX "LateOffer_patientId_status_idx" ON "LateOffer"("patientId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LateOffer_lateEventId_waitlistEntryId_key" ON "LateOffer"("lateEventId", "waitlistEntryId");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_createdAt_idx" ON "WhatsAppMessage"("createdAt");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_externalId_idx" ON "WhatsAppMessage"("externalId");

-- CreateIndex
CREATE INDEX "Session_paymentId_idx" ON "Session"("paymentId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "Treatment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LateEvent" ADD CONSTRAINT "LateEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LateEvent" ADD CONSTRAINT "LateEvent_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LateOffer" ADD CONSTRAINT "LateOffer_lateEventId_fkey" FOREIGN KEY ("lateEventId") REFERENCES "LateEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LateOffer" ADD CONSTRAINT "LateOffer_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

