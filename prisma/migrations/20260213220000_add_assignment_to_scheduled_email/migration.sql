-- AlterTable
ALTER TABLE "ScheduledEmail" ADD COLUMN "assignmentId" TEXT;

-- CreateIndex
CREATE INDEX "ScheduledEmail_assignmentId_idx" ON "ScheduledEmail"("assignmentId");

-- AddForeignKey
ALTER TABLE "ScheduledEmail" ADD CONSTRAINT "ScheduledEmail_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
