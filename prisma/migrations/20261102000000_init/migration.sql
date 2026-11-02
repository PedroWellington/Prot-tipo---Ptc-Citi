-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'RECEPCAO', 'FISIOTERAPEUTA', 'PACIENTE');

-- CreateEnum
CREATE TYPE "PatientType" AS ENUM ('PARTICULAR', 'CONVENIO');

-- CreateEnum
CREATE TYPE "TreatmentStatus" AS ENUM ('ATIVO', 'CONCLUIDO', 'ABANDONADO');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('AGENDADA', 'CONFIRMADA', 'REALIZADA', 'FALTA', 'DESMARCADA', 'REAGENDADA');

-- CreateEnum
CREATE TYPE "RescheduleStatus" AS ENUM ('PENDENTE', 'APROVADA', 'RECUSADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "RenewalStatus" AS ENUM ('NAO_INICIADA', 'SOLICITADA', 'EM_ANALISE', 'LIBERADA', 'NEGADA');

-- CreateEnum
CREATE TYPE "WaitlistStatus" AS ENUM ('ATIVA', 'OFERTADA', 'ACEITA', 'EXPIRADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDENTE', 'ENVIADO', 'FALHOU', 'IGNORADO');

-- CreateEnum
CREATE TYPE "VerificationPurpose" AS ENUM ('CADASTRO', 'SENHA');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "unitId" TEXT,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "onboardedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "type" "PatientType" NOT NULL,
    "insurer" TEXT,
    "cardNumber" TEXT,
    "secondContactName" TEXT,
    "secondContactPhone" TEXT,
    "preferredUnitId" TEXT,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "notifyEmail" BOOLEAN NOT NULL DEFAULT true,
    "notifyEducational" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PatientProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "openHour" INTEGER NOT NULL DEFAULT 7,
    "closeHour" INTEGER NOT NULL DEFAULT 20,
    "saturdayEnabled" BOOLEAN NOT NULL DEFAULT false,
    "satOpenHour" INTEGER NOT NULL DEFAULT 8,
    "satCloseHour" INTEGER NOT NULL DEFAULT 12,
    "chairs" INTEGER NOT NULL DEFAULT 4,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Physiotherapist" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "crefito" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Physiotherapist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Treatment" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "physioId" TEXT,
    "totalSessions" INTEGER NOT NULL DEFAULT 10,
    "completedSessions" INTEGER NOT NULL DEFAULT 0,
    "status" "TreatmentStatus" NOT NULL DEFAULT 'ATIVO',
    "endReason" TEXT,
    "scriptDoneAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "Treatment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "treatmentId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "physioId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'AGENDADA',
    "provisional" BOOLEAN NOT NULL DEFAULT false,
    "isReplacement" BOOLEAN NOT NULL DEFAULT false,
    "rescheduledFromId" TEXT,
    "reason" TEXT,
    "reasonNote" TEXT,
    "noticeHours" DOUBLE PRECISION,
    "confirmedAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "unconfirmedAlertAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RescheduleRequest" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "targetStartsAt" TIMESTAMP(3) NOT NULL,
    "targetUnitId" TEXT NOT NULL,
    "reason" TEXT,
    "status" "RescheduleStatus" NOT NULL DEFAULT 'PENDENTE',
    "response" TEXT,
    "suggestion" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RescheduleRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsuranceRenewal" (
    "id" TEXT NOT NULL,
    "treatmentId" TEXT NOT NULL,
    "status" "RenewalStatus" NOT NULL DEFAULT 'NAO_INICIADA',
    "requestedAt" TIMESTAMP(3),
    "expectedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "note" TEXT,
    "attachment" TEXT,
    "alertedAt" TIMESTAMP(3),
    "remindedAt" TIMESTAMP(3),
    "heldReleasedAt" TIMESTAMP(3),

    CONSTRAINT "InsuranceRenewal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "hour" INTEGER NOT NULL,
    "status" "WaitlistStatus" NOT NULL DEFAULT 'ATIVA',
    "offeredStartsAt" TIMESTAMP(3),
    "offeredPhysioId" TEXT,
    "holdUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT,
    "actions" JSONB,
    "emailStatus" "DeliveryStatus" NOT NULL DEFAULT 'IGNORADO',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailVerification" (
    "id" TEXT NOT NULL,
    "purpose" "VerificationPurpose" NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "payload" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfirmationToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "reminderHours" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "ConfirmationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressMessage" (
    "id" TEXT NOT NULL,
    "sessionNumber" INTEGER NOT NULL,
    "totalSessions" INTEGER NOT NULL DEFAULT 10,
    "text" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgressMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guidance" (
    "id" TEXT NOT NULL,
    "treatmentId" TEXT NOT NULL,
    "physioId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "url" TEXT,
    "fileName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Guidance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "unitId" TEXT,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "PatientProfile_userId_key" ON "PatientProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientProfile_cpf_key" ON "PatientProfile"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_code_key" ON "Unit"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Physiotherapist_userId_key" ON "Physiotherapist"("userId");

-- CreateIndex
CREATE INDEX "Physiotherapist_unitId_idx" ON "Physiotherapist"("unitId");

-- CreateIndex
CREATE INDEX "Treatment_patientId_status_idx" ON "Treatment"("patientId", "status");

-- CreateIndex
CREATE INDEX "Treatment_status_idx" ON "Treatment"("status");

-- CreateIndex
CREATE INDEX "Session_unitId_startsAt_idx" ON "Session"("unitId", "startsAt");

-- CreateIndex
CREATE INDEX "Session_physioId_startsAt_idx" ON "Session"("physioId", "startsAt");

-- CreateIndex
CREATE INDEX "Session_treatmentId_startsAt_idx" ON "Session"("treatmentId", "startsAt");

-- CreateIndex
CREATE INDEX "Session_patientId_startsAt_idx" ON "Session"("patientId", "startsAt");

-- CreateIndex
CREATE INDEX "Session_status_startsAt_idx" ON "Session"("status", "startsAt");

-- CreateIndex
CREATE INDEX "RescheduleRequest_status_createdAt_idx" ON "RescheduleRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "RescheduleRequest_patientId_createdAt_idx" ON "RescheduleRequest"("patientId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InsuranceRenewal_treatmentId_key" ON "InsuranceRenewal"("treatmentId");

-- CreateIndex
CREATE INDEX "InsuranceRenewal_status_idx" ON "InsuranceRenewal"("status");

-- CreateIndex
CREATE INDEX "WaitlistEntry_unitId_weekday_hour_status_idx" ON "WaitlistEntry"("unitId", "weekday", "hour", "status");

-- CreateIndex
CREATE INDEX "WaitlistEntry_status_holdUntil_idx" ON "WaitlistEntry"("status", "holdUntil");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_emailStatus_nextAttemptAt_idx" ON "Notification"("emailStatus", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "EmailVerification_email_purpose_idx" ON "EmailVerification"("email", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "ConfirmationToken_tokenHash_key" ON "ConfirmationToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "ConfirmationToken_sessionId_reminderHours_key" ON "ConfirmationToken"("sessionId", "reminderHours");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressMessage_sessionNumber_totalSessions_key" ON "ProgressMessage"("sessionNumber", "totalSessions");

-- CreateIndex
CREATE INDEX "Guidance_treatmentId_createdAt_idx" ON "Guidance"("treatmentId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "Holiday_date_idx" ON "Holiday"("date");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientProfile" ADD CONSTRAINT "PatientProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientProfile" ADD CONSTRAINT "PatientProfile_preferredUnitId_fkey" FOREIGN KEY ("preferredUnitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Physiotherapist" ADD CONSTRAINT "Physiotherapist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Physiotherapist" ADD CONSTRAINT "Physiotherapist_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Treatment" ADD CONSTRAINT "Treatment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Treatment" ADD CONSTRAINT "Treatment_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Treatment" ADD CONSTRAINT "Treatment_physioId_fkey" FOREIGN KEY ("physioId") REFERENCES "Physiotherapist"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "Treatment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_physioId_fkey" FOREIGN KEY ("physioId") REFERENCES "Physiotherapist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RescheduleRequest" ADD CONSTRAINT "RescheduleRequest_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RescheduleRequest" ADD CONSTRAINT "RescheduleRequest_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RescheduleRequest" ADD CONSTRAINT "RescheduleRequest_targetUnitId_fkey" FOREIGN KEY ("targetUnitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceRenewal" ADD CONSTRAINT "InsuranceRenewal_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "Treatment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfirmationToken" ADD CONSTRAINT "ConfirmationToken_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guidance" ADD CONSTRAINT "Guidance_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "Treatment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guidance" ADD CONSTRAINT "Guidance_physioId_fkey" FOREIGN KEY ("physioId") REFERENCES "Physiotherapist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Anti-dupla-reserva: só sessões ativas ocupam o horário; desmarcadas/reagendadas liberam a vaga.
CREATE UNIQUE INDEX "session_physio_slot" ON "Session"("physioId", "startsAt") WHERE "status" IN ('AGENDADA', 'CONFIRMADA');
CREATE UNIQUE INDEX "session_patient_slot" ON "Session"("patientId", "startsAt") WHERE "status" IN ('AGENDADA', 'CONFIRMADA');
-- Um tratamento ativo por paciente e uma solicitação pendente por sessão.
CREATE UNIQUE INDEX "treatment_one_active" ON "Treatment"("patientId") WHERE "status" = 'ATIVO';
CREATE UNIQUE INDEX "reschedule_one_pending" ON "RescheduleRequest"("sessionId") WHERE "status" = 'PENDENTE';
