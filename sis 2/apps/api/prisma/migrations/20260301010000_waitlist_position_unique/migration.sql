-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_sectionId_waitlistPosition_key" ON "Enrollment"("sectionId", "waitlistPosition");
