-- OPERATOR ONLY. Run ONLY AFTER 03-auth-postflight.sql succeeds and the exact
-- versioned migration completed. Alternative: prisma migrate resolve --applied.
-- This records history; it does not apply or fix the schema.
BEGIN;
DO $$
DECLARE
  migration CONSTANT text := '20261113120000_auth_account_lifecycle';
  expected_checksum CONSTANT text := '3b774848f014cf0906ceb3329a791539e941514f63ca7afc720d2faad0ed11e5';
BEGIN
  IF to_regclass('public."AuthThrottle"') IS NULL OR to_regclass('public."AccountBootstrap"') IS NULL
     OR (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='User'
         AND column_name IN ('sessionVersion','passwordExpiresAt')) <> 2
     OR (SELECT count(*) FROM pg_indexes WHERE schemaname='public'
         AND indexname IN ('User_username_normalized_key','User_email_normalized_key')) <> 2
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public."User"'::regclass
         AND tgname='User_revoke_changed_credentials' AND tgenabled='O') THEN
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
FROM public._prisma_migrations WHERE migration_name='20261113120000_auth_account_lifecycle';
