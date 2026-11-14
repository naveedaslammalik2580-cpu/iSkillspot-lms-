-- Additive only. Existing accounts and enrollments retain access by default.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';
-- CreateEnum
CREATE TYPE "AdmissionStatus" AS ENUM ('DRAFT', 'PENDING', 'INFORMATION_REQUESTED', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "admissionRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "admissionPayment" DOUBLE PRECISION,
ADD COLUMN     "admissionsOpen" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN     "accessSuspended" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "referenceKey" TEXT;

-- CreateTable
CREATE TABLE "Admission" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT,
    "batchId" TEXT,
    "status" "AdmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "totalFee" DOUBLE PRECISION,
    "requiredPayment" DOUBLE PRECISION,
    "installmentApproved" BOOLEAN NOT NULL DEFAULT false,
    "paymentId" TEXT,
    "reviewNote" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Admission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailOutbox" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "encryptedBody" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Admission_applicationId_key" ON "Admission"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "Admission_paymentId_key" ON "Admission"("paymentId");

-- CreateIndex
CREATE INDEX "Admission_userId_status_idx" ON "Admission"("userId", "status");

-- CreateIndex
CREATE INDEX "Admission_status_createdAt_idx" ON "Admission"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuthToken_digest_key" ON "AuthToken"("digest");

-- CreateIndex
CREATE INDEX "AuthToken_userId_purpose_idx" ON "AuthToken"("userId", "purpose");

-- CreateIndex
CREATE INDEX "AuthToken_expiresAt_idx" ON "AuthToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailOutbox_dedupeKey_key" ON "EmailOutbox"("dedupeKey");

-- CreateIndex
CREATE INDEX "EmailOutbox_status_availableAt_idx" ON "EmailOutbox"("status", "availableAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_referenceKey_key" ON "Payment"("referenceKey");

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthToken" ADD CONSTRAINT "AuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Admission_open_course_key" ON "Admission" ("userId", "courseId")
  WHERE "status" IN ('PENDING', 'INFORMATION_REQUESTED', 'APPROVED');
CREATE UNIQUE INDEX "Admission_one_draft_key" ON "Admission" ("userId") WHERE "status" = 'DRAFT';
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_amounts_check" CHECK (
  ("totalFee" IS NULL OR ("totalFee" >= 0 AND "totalFee" <= 100000000)) AND
  ("requiredPayment" IS NULL OR ("requiredPayment" >= 0 AND "requiredPayment" <= "totalFee"))
);
ALTER TABLE "AuthToken" ADD CONSTRAINT "AuthToken_purpose_check" CHECK (purpose IN ('VERIFY_EMAIL','RESET_PASSWORD'));
ALTER TABLE "EmailOutbox" ADD CONSTRAINT "EmailOutbox_status_check" CHECK (status IN ('PENDING','SENDING','FAILED','SENT'));
-- Application uses Prisma's private database connection, not Supabase Auth.
-- No public Data API policies: token digests and encrypted mail are server-only.
ALTER TABLE "Admission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuthToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmailOutbox" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "Admission", "AuthToken", "EmailOutbox" FROM PUBLIC;
DO $$ DECLARE api_role text; BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=api_role) THEN
      EXECUTE format('REVOKE ALL ON "Admission", "AuthToken", "EmailOutbox" FROM %I', api_role);
    END IF;
  END LOOP;
END $$;
COMMIT;
