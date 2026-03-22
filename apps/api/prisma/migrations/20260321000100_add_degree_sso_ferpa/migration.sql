ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "degreeProgram" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "ssoProvider" TEXT;

CREATE TABLE IF NOT EXISTS "DegreeProgram" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "totalCredits" INTEGER NOT NULL DEFAULT 120,
  "minGpa" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DegreeProgram_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DegreeProgram_name_key" ON "DegreeProgram"("name");

CREATE TABLE IF NOT EXISTS "DegreeRequirement" (
  "id" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "minCredits" INTEGER NOT NULL,
  "minCourses" INTEGER NOT NULL DEFAULT 0,
  "courseCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "prefixes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "minGrade" TEXT NOT NULL DEFAULT 'D',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DegreeRequirement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DegreeRequirement_programId_category_idx" ON "DegreeRequirement"("programId", "category");
ALTER TABLE "DegreeRequirement"
  ADD CONSTRAINT "DegreeRequirement_programId_fkey"
  FOREIGN KEY ("programId") REFERENCES "DegreeProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "DataDeletionRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "reason" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "DataDeletionRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DataDeletionRequest_userId_status_idx" ON "DataDeletionRequest"("userId", "status");
CREATE INDEX IF NOT EXISTS "DataDeletionRequest_status_requestedAt_idx" ON "DataDeletionRequest"("status", "requestedAt");
ALTER TABLE "DataDeletionRequest"
  ADD CONSTRAINT "DataDeletionRequest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "DataAccessLog" (
  "id" TEXT NOT NULL,
  "accessorId" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "ipAddress" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataAccessLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DataAccessLog_targetId_createdAt_idx" ON "DataAccessLog"("targetId", "createdAt");
CREATE INDEX IF NOT EXISTS "DataAccessLog_accessorId_createdAt_idx" ON "DataAccessLog"("accessorId", "createdAt");
CREATE INDEX IF NOT EXISTS "DataAccessLog_resource_action_createdAt_idx" ON "DataAccessLog"("resource", "action", "createdAt");
