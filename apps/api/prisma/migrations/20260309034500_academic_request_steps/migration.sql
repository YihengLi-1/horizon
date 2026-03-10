CREATE TYPE "AcademicRequestStepStatus" AS ENUM ('WAITING', 'PENDING', 'APPROVED', 'REJECTED', 'SKIPPED');

ALTER TABLE "AcademicRequest"
ADD COLUMN "currentStepOrder" INTEGER;

CREATE TABLE "AcademicRequestStep" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "stepOrder" INTEGER NOT NULL,
  "stepKey" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "requiredApproverRole" "Role" NOT NULL,
  "ownerUserId" TEXT,
  "status" "AcademicRequestStepStatus" NOT NULL DEFAULT 'WAITING',
  "decisionNote" TEXT,
  "decidedByUserId" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AcademicRequestStep_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AcademicRequestStep_requestId_stepOrder_key" ON "AcademicRequestStep"("requestId", "stepOrder");
CREATE INDEX "AcademicRequestStep_ownerUserId_status_idx" ON "AcademicRequestStep"("ownerUserId", "status");
CREATE INDEX "AcademicRequestStep_requiredApproverRole_status_idx" ON "AcademicRequestStep"("requiredApproverRole", "status");

ALTER TABLE "AcademicRequestStep"
ADD CONSTRAINT "AcademicRequestStep_requestId_fkey"
FOREIGN KEY ("requestId") REFERENCES "AcademicRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AcademicRequestStep"
ADD CONSTRAINT "AcademicRequestStep_ownerUserId_fkey"
FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AcademicRequestStep"
ADD CONSTRAINT "AcademicRequestStep_decidedByUserId_fkey"
FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
