/*
  Warnings:

  - You are about to drop the column `deletedBy` on the `Door` table. All the data in the column will be lost.
  - You are about to drop the column `brokenAt` on the `Seal` table. All the data in the column will be lost.
  - You are about to drop the column `brokenBy` on the `Seal` table. All the data in the column will be lost.
  - You are about to drop the column `disabledAt` on the `Seal` table. All the data in the column will be lost.
  - You are about to drop the column `disabledBy` on the `Seal` table. All the data in the column will be lost.
  - You are about to drop the column `enabledAt` on the `Seal` table. All the data in the column will be lost.
  - You are about to drop the column `enabledBy` on the `Seal` table. All the data in the column will be lost.
  - You are about to drop the column `installedAt` on the `Seal` table. All the data in the column will be lost.
  - You are about to drop the column `installedBy` on the `Seal` table. All the data in the column will be lost.
  - You are about to drop the column `removedAt` on the `Seal` table. All the data in the column will be lost.
  - You are about to drop the column `removedBy` on the `Seal` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_doorId_fkey";

-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_sealId_fkey";

-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_userId_fkey";

-- DropForeignKey
ALTER TABLE "Door" DROP CONSTRAINT "Door_deletedBy_fkey";

-- DropForeignKey
ALTER TABLE "Seal" DROP CONSTRAINT "Seal_brokenBy_fkey";

-- DropForeignKey
ALTER TABLE "Seal" DROP CONSTRAINT "Seal_disabledBy_fkey";

-- DropForeignKey
ALTER TABLE "Seal" DROP CONSTRAINT "Seal_enabledBy_fkey";

-- DropForeignKey
ALTER TABLE "Seal" DROP CONSTRAINT "Seal_installedBy_fkey";

-- DropForeignKey
ALTER TABLE "Seal" DROP CONSTRAINT "Seal_removedBy_fkey";

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "doorName" TEXT;

-- AlterTable
ALTER TABLE "Door" DROP COLUMN "deletedBy";

-- AlterTable
ALTER TABLE "Seal" DROP COLUMN "brokenAt",
DROP COLUMN "brokenBy",
DROP COLUMN "disabledAt",
DROP COLUMN "disabledBy",
DROP COLUMN "enabledAt",
DROP COLUMN "enabledBy",
DROP COLUMN "installedAt",
DROP COLUMN "installedBy",
DROP COLUMN "removedAt",
DROP COLUMN "removedBy",
ADD COLUMN     "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "changedBy" TEXT;

-- AddForeignKey
ALTER TABLE "Seal" ADD CONSTRAINT "Seal_changedBy_fkey" FOREIGN KEY ("changedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_doorId_fkey" FOREIGN KEY ("doorId") REFERENCES "Door"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_sealId_fkey" FOREIGN KEY ("sealId") REFERENCES "Seal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
