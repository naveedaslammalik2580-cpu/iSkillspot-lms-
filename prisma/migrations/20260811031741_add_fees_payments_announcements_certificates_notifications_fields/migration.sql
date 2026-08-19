/*
  Warnings:

  - Added the required column `updatedAt` to the `Announcement` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "FeeStatus" ADD VALUE 'WAIVED';

-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Certificate" ADD COLUMN     "issuedBy" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "revokeReason" TEXT,
ADD COLUMN     "revokedAt" TIMESTAMP(3),
ADD COLUMN     "revokedBy" TEXT;

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "defaultFee" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Fee" ADD COLUMN     "description" TEXT;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "linkUrl" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3),
ADD COLUMN     "voidedBy" TEXT;
