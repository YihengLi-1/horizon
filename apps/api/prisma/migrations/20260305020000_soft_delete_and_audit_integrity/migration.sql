-- Soft delete support for user + enrollment
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Enrollment" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Audit integrity chain fields (tamper-evident)
ALTER TABLE "AuditLog" ADD COLUMN "prevIntegrityHash" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "integrityHash" TEXT;

-- Query-path indexes
CREATE INDEX "User_role_deletedAt_idx" ON "User"("role", "deletedAt");
CREATE INDEX "Enrollment_studentId_termId_deletedAt_idx" ON "Enrollment"("studentId", "termId", "deletedAt");
CREATE INDEX "Enrollment_sectionId_status_deletedAt_idx" ON "Enrollment"("sectionId", "status", "deletedAt");
