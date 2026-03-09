CREATE TYPE "HoldType" AS ENUM ('REGISTRATION', 'ACADEMIC', 'FINANCIAL');
CREATE TYPE "AcademicRequestType" AS ENUM ('CREDIT_OVERLOAD');
CREATE TYPE "AcademicRequestStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'WITHDRAWN');

CREATE TABLE IF NOT EXISTS "StudentHold" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "type" "HoldType" NOT NULL,
  "reason" TEXT NOT NULL,
  "note" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "createdByUserId" TEXT,
  "resolvedByUserId" TEXT,
  CONSTRAINT "StudentHold_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudentHold_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StudentHold_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "StudentHold_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "StudentHold_studentId_active_expiresAt_idx" ON "StudentHold"("studentId", "active", "expiresAt");
CREATE INDEX IF NOT EXISTS "StudentHold_type_active_idx" ON "StudentHold"("type", "active");

CREATE TABLE IF NOT EXISTS "AcademicRequest" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "type" "AcademicRequestType" NOT NULL,
  "status" "AcademicRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
  "termId" TEXT,
  "sectionId" TEXT,
  "reason" TEXT NOT NULL,
  "requestedCredits" INTEGER,
  "requiredApproverRole" "Role",
  "ownerUserId" TEXT,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decisionAt" TIMESTAMP(3),
  "decisionNote" TEXT,
  "decidedByUserId" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AcademicRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AcademicRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AcademicRequest_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AcademicRequest_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AcademicRequest_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AcademicRequest_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "AcademicRequest_studentId_status_idx" ON "AcademicRequest"("studentId", "status");
CREATE INDEX IF NOT EXISTS "AcademicRequest_ownerUserId_status_idx" ON "AcademicRequest"("ownerUserId", "status");
CREATE INDEX IF NOT EXISTS "AcademicRequest_termId_type_status_idx" ON "AcademicRequest"("termId", "type", "status");
CREATE INDEX IF NOT EXISTS "AcademicRequest_sectionId_type_status_idx" ON "AcademicRequest"("sectionId", "type", "status");
