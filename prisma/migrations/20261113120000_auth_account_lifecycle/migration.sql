-- Additive authentication migration. No account/password/role provisioning.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "passwordExpiresAt" TIMESTAMP(3),
ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "AuthThrottle" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthThrottle_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AccountBootstrap" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountBootstrap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuthThrottle_expiresAt_idx" ON "AuthThrottle"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AccountBootstrap_userId_key" ON "AccountBootstrap"("userId");

-- Abort safely on normalized duplicates; do not silently merge identities.
CREATE UNIQUE INDEX "User_username_normalized_key" ON "User" (lower(btrim("username")));
CREATE UNIQUE INDEX "User_email_normalized_key" ON "User" (lower(btrim("email")));

-- Preserve credentials; give pre-existing temporary-password accounts a
-- documented 24-hour transition window from operator migration execution.
UPDATE "User" SET "passwordExpiresAt" = CURRENT_TIMESTAMP + INTERVAL '24 hours'
WHERE "mustChangePassword" = true AND "passwordExpiresAt" IS NULL;

-- Covers application writes AND operator role/status/password changes.
CREATE FUNCTION public.iskillspot_revoke_changed_credentials() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW."passwordHash" IS DISTINCT FROM OLD."passwordHash"
     OR NEW."role" IS DISTINCT FROM OLD."role"
     OR NEW."status" IS DISTINCT FROM OLD."status"
     OR NEW."mustChangePassword" IS DISTINCT FROM OLD."mustChangePassword" THEN
    NEW."sessionVersion" := GREATEST(NEW."sessionVersion", OLD."sessionVersion" + 1);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "User_revoke_changed_credentials"
BEFORE UPDATE ON public."User" FOR EACH ROW
EXECUTE FUNCTION public.iskillspot_revoke_changed_credentials();

ALTER TABLE public."AuthThrottle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AccountBootstrap" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;
-- Custom Prisma auth uses a private database role, never the Data API roles.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public."User", public."AuthThrottle", public."AccountBootstrap" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public."User", public."AuthThrottle", public."AccountBootstrap" FROM authenticated;
  END IF;
END;
$$;
COMMIT;
