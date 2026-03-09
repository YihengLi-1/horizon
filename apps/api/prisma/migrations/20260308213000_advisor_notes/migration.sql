CREATE TABLE IF NOT EXISTS "AdvisorNote" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "advisorId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdvisorNote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdvisorNote_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AdvisorNote_advisorId_fkey" FOREIGN KEY ("advisorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "AdvisorNote_studentId_createdAt_idx" ON "AdvisorNote"("studentId", "createdAt");
CREATE INDEX IF NOT EXISTS "AdvisorNote_advisorId_createdAt_idx" ON "AdvisorNote"("advisorId", "createdAt");
