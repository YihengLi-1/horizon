ALTER TABLE "Announcement"
ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS "CartItem_studentId_idx" ON "CartItem"("studentId");

CREATE INDEX IF NOT EXISTS "Announcement_active_expiresAt_idx" ON "Announcement"("active", "expiresAt");
