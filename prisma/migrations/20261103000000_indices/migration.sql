DROP INDEX "User_role_idx";
CREATE INDEX "User_role_unitId_idx" ON "User"("role", "unitId");
CREATE INDEX "RescheduleRequest_sessionId_idx" ON "RescheduleRequest"("sessionId");
CREATE INDEX "WaitlistEntry_patientId_status_idx" ON "WaitlistEntry"("patientId", "status");
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");
CREATE INDEX "Guidance_fileName_idx" ON "Guidance"("fileName");
