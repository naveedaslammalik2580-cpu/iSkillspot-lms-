-- Reconciles PR #5 and PR #6 without changing either original migration.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';
ALTER TABLE "AuthToken" ADD COLUMN "requestedById" TEXT;
ALTER TABLE "EmailOutbox" DROP CONSTRAINT "EmailOutbox_status_check";
ALTER TABLE "EmailOutbox" ADD CONSTRAINT "EmailOutbox_status_check"
  CHECK (status IN ('PENDING','SENDING','FAILED','SENT','CANCELED'));
-- Old reset links lacked a session-version binding. Keep their history, but
-- require a fresh link from the unified service after this deployment.
UPDATE "PasswordResetToken" SET "usedAt"=timezone('UTC', CURRENT_TIMESTAMP) WHERE "usedAt" IS NULL;
ALTER TABLE "PasswordResetToken" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "PasswordResetToken" FROM PUBLIC;
DO $$ DECLARE api_role text; BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=api_role) THEN
      EXECUTE format('REVOKE ALL ON "PasswordResetToken" FROM %I', api_role);
    END IF;
  END LOOP;
END $$;
COMMIT;
