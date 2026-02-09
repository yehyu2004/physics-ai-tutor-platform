/*
  Warnings:

  - You are about to drop the column `bannedAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `deletedAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `isBanned` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `isDeleted` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `isRestricted` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "bannedAt",
DROP COLUMN "deletedAt",
DROP COLUMN "isBanned",
DROP COLUMN "isDeleted",
DROP COLUMN "isRestricted";
