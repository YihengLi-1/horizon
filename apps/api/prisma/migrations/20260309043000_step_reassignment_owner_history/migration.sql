ALTER TABLE "AcademicRequestStep"
ADD COLUMN "initialOwnerUserId" TEXT;

UPDATE "AcademicRequestStep"
SET "initialOwnerUserId" = "ownerUserId"
WHERE "initialOwnerUserId" IS NULL;

ALTER TABLE "AcademicRequestStep"
ADD CONSTRAINT "AcademicRequestStep_initialOwnerUserId_fkey"
FOREIGN KEY ("initialOwnerUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "AcademicRequestStep_initialOwnerUserId_idx"
ON "AcademicRequestStep"("initialOwnerUserId");
