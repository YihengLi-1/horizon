ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'FACULTY';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ADVISOR';

ALTER TABLE "Section"
  ADD COLUMN IF NOT EXISTS "instructorUserId" TEXT;

CREATE TABLE IF NOT EXISTS "FacultyProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "employeeId" TEXT,
  "department" TEXT,
  "title" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FacultyProfile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FacultyProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "FacultyProfile_userId_key" ON "FacultyProfile"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "FacultyProfile_employeeId_key" ON "FacultyProfile"("employeeId");

CREATE TABLE IF NOT EXISTS "AdvisorProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "employeeId" TEXT,
  "department" TEXT,
  "officeLocation" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdvisorProfile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdvisorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "AdvisorProfile_userId_key" ON "AdvisorProfile"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "AdvisorProfile_employeeId_key" ON "AdvisorProfile"("employeeId");

CREATE TABLE IF NOT EXISTS "AdvisorAssignment" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "advisorId" TEXT NOT NULL,
  "assignedByUserId" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  CONSTRAINT "AdvisorAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdvisorAssignment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AdvisorAssignment_advisorId_fkey" FOREIGN KEY ("advisorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AdvisorAssignment_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "AdvisorAssignment_studentId_active_idx" ON "AdvisorAssignment"("studentId", "active");
CREATE INDEX IF NOT EXISTS "AdvisorAssignment_advisorId_active_idx" ON "AdvisorAssignment"("advisorId", "active");
CREATE INDEX IF NOT EXISTS "Section_instructorUserId_idx" ON "Section"("instructorUserId");

DO $$
BEGIN
  ALTER TABLE "Section"
    ADD CONSTRAINT "Section_instructorUserId_fkey"
    FOREIGN KEY ("instructorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
