-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_doorId_fkey";

-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_sealId_fkey";

-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_userId_fkey";

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_doorId_fkey" FOREIGN KEY ("doorId") REFERENCES "Door"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_sealId_fkey" FOREIGN KEY ("sealId") REFERENCES "Seal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
