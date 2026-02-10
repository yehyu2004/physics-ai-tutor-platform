-- AlterTable
ALTER TABLE "AppealMessage" ADD COLUMN     "imageUrls" JSONB;

-- AlterTable
ALTER TABLE "GradeAppeal" ADD COLUMN     "imageUrls" JSONB;

-- AlterTable
ALTER TABLE "SubmissionAnswer" ADD COLUMN     "feedbackImageUrls" JSONB;
