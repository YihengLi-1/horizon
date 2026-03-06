-- Session 14 foundation: refresh tokens, system settings, soft-delete backfill, and perf indexes.

ALTER TABLE "Course"
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "RefreshToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "RefreshToken_token_key" ON "RefreshToken"("token");
CREATE INDEX IF NOT EXISTS "RefreshToken_userId_idx" ON "RefreshToken"("userId");
CREATE INDEX IF NOT EXISTS "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

CREATE TABLE IF NOT EXISTS "SystemSetting" (
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

ALTER TABLE "SystemSetting"
  ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

INSERT INTO "SystemSetting" ("key", "value", "updatedAt") VALUES
  ('maintenance_mode', 'false', CURRENT_TIMESTAMP),
  ('max_credits_per_term', '18', CURRENT_TIMESTAMP),
  ('registration_message', '', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

CREATE INDEX IF NOT EXISTS "Enrollment_studentId_idx" ON "Enrollment"("studentId");
CREATE INDEX IF NOT EXISTS "Enrollment_sectionId_idx" ON "Enrollment"("sectionId");
CREATE INDEX IF NOT EXISTS "Enrollment_status_idx" ON "Enrollment"("status");
CREATE INDEX IF NOT EXISTS "Enrollment_studentId_status_idx" ON "Enrollment"("studentId", "status");

CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_actorUserId_idx" ON "AuditLog"("actorUserId");
CREATE INDEX IF NOT EXISTS "AuditLog_action_idx" ON "AuditLog"("action");

CREATE INDEX IF NOT EXISTS "Section_courseId_idx" ON "Section"("courseId");
CREATE INDEX IF NOT EXISTS "Section_termId_idx" ON "Section"("termId");
CREATE INDEX IF NOT EXISTS "CourseRating_sectionId_idx" ON "CourseRating"("sectionId");
CREATE INDEX IF NOT EXISTS "Announcement_expiresAt_idx" ON "Announcement"("expiresAt");
CREATE INDEX IF NOT EXISTS "Announcement_audience_idx" ON "Announcement"("audience");
CREATE INDEX IF NOT EXISTS "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");
