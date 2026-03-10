CREATE TYPE "AcademicRequestStepOwnerStrategy" AS ENUM (
  'DIRECT_USER',
  'PRIMARY_ADVISOR',
  'SECTION_INSTRUCTOR',
  'ADMIN_REVIEWER'
);

ALTER TABLE "AcademicRequestStep"
  ADD COLUMN "ownerStrategy" "AcademicRequestStepOwnerStrategy" NOT NULL DEFAULT 'DIRECT_USER',
  ADD COLUMN "ownerResolutionRefId" TEXT,
  ADD COLUMN "ownerResolvedAt" TIMESTAMP(3);

UPDATE "AcademicRequestStep"
SET
  "ownerResolutionRefId" = "ownerUserId",
  "ownerResolvedAt" = CASE
    WHEN "ownerUserId" IS NOT NULL THEN COALESCE("createdAt", NOW())
    ELSE NULL
  END;

CREATE INDEX "AcademicRequestStep_ownerStrategy_status_idx"
  ON "AcademicRequestStep"("ownerStrategy", "status");
