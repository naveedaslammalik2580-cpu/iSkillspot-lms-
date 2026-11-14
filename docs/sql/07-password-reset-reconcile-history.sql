-- OPERATOR ONLY. Run ONLY AFTER 06-password-reset-postflight.sql succeeds
-- and the exact versioned migration file was executed unchanged.
-- Alternative: prisma migrate resolve --applied 20261114084833_password_reset_tokens.
-- This records history; it does not apply or fix the schema.
BEGIN;
DO $$
DECLARE
  migration CONSTANT text := '20261114084833_password_reset_tokens';
  expected_checksum CONSTANT text := '0d0530bd0968234983effc2443300d30c75beaa9bb9fbb5a7468b4f5743705a1';
BEGIN
  PERFORM pg_advisory_xact_lock(752091, 5);
  IF to_regclass('public."PasswordResetToken"') IS NULL
     OR (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='PasswordResetToken') <> 7
     OR (SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND tablename='PasswordResetToken'
         AND indexname IN ('PasswordResetToken_tokenHash_key','PasswordResetToken_userId_idx','PasswordResetToken_expiresAt_idx')) <> 3
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."PasswordResetToken"'::regclass
         AND contype='f' AND conname='PasswordResetToken_userId_fkey') THEN
    RAISE EXCEPTION 'Migration verification incomplete. Do not mark it applied.';
  END IF;
  IF EXISTS (SELECT 1 FROM public._prisma_migrations WHERE migration_name=migration
             AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND checksum=expected_checksum) THEN
    RAISE NOTICE 'Matching migration history already exists; nothing changed.';
  ELSIF EXISTS (SELECT 1 FROM public._prisma_migrations WHERE migration_name=migration) THEN
    RAISE EXCEPTION 'Existing migration history differs or is incomplete. Review it; do not overwrite it.';
  ELSE
    INSERT INTO public._prisma_migrations
      (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
    VALUES (gen_random_uuid()::text, expected_checksum, CURRENT_TIMESTAMP, migration, NULL, NULL, CURRENT_TIMESTAMP, 1);
  END IF;
END;
$$;
COMMIT;
SELECT migration_name, finished_at IS NOT NULL AS finished, applied_steps_count
FROM public._prisma_migrations WHERE migration_name='20261114084833_password_reset_tokens';
