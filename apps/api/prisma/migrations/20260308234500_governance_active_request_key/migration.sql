ALTER TABLE "AcademicRequest"
ADD COLUMN IF NOT EXISTS "activeRequestKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "AcademicRequest_activeRequestKey_key"
ON "AcademicRequest"("activeRequestKey");
