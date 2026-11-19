-- AlterEnum
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'STUDENT');
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TABLE "Announcement" ALTER COLUMN "targetRole" TYPE "Role_new" USING ("targetRole"::text::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "Role_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "Teacher" DROP CONSTRAINT "Teacher_userId_fkey";

-- DropForeignKey
ALTER TABLE "Batch" DROP CONSTRAINT "Batch_teacherId_fkey";

-- DropForeignKey
ALTER TABLE "Attendance" DROP CONSTRAINT "Attendance_batchId_fkey";

-- DropForeignKey
ALTER TABLE "Attendance" DROP CONSTRAINT "Attendance_studentId_fkey";

-- DropForeignKey
ALTER TABLE "Grade" DROP CONSTRAINT "Grade_courseId_fkey";

-- DropForeignKey
ALTER TABLE "Grade" DROP CONSTRAINT "Grade_studentId_fkey";

-- DropForeignKey
ALTER TABLE "Announcement" DROP CONSTRAINT "Announcement_teacherId_fkey";

-- DropIndex
DROP INDEX "Batch_teacherId_idx";

-- AlterTable
ALTER TABLE "Batch" DROP COLUMN "teacherId";

-- AlterTable
ALTER TABLE "Announcement" DROP COLUMN "teacherId";

-- DropTable
DROP TABLE "Teacher";

-- DropTable
DROP TABLE "Attendance";

-- DropTable
DROP TABLE "Grade";

-- DropEnum
DROP TYPE "AttendanceStatus";

