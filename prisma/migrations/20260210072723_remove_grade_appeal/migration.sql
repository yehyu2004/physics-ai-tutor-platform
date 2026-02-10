/*
  Warnings:

  - You are about to drop the `GradeAppeal` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "GradeAppeal" DROP CONSTRAINT "GradeAppeal_questionId_fkey";

-- DropForeignKey
ALTER TABLE "GradeAppeal" DROP CONSTRAINT "GradeAppeal_submissionId_fkey";

-- DropForeignKey
ALTER TABLE "GradeAppeal" DROP CONSTRAINT "GradeAppeal_userId_fkey";

-- DropTable
DROP TABLE "GradeAppeal";
