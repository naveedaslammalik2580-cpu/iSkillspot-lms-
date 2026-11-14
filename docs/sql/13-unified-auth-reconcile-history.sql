-- Only after the exact migration and consolidated postflight succeed.
BEGIN;
DO $$
DECLARE migration CONSTANT text := '20261114180000_unify_auth_recovery';
expected_checksum CONSTANT text := 'b38fe7a97f9b6f213fccd42aeba82ade6d86e98fe4a997de3e886f4b56fd0f43';
BEGIN
 PERFORM pg_advisory_xact_lock(752091,4);
 IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='AuthToken' AND column_name='requestedById') OR
 NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."EmailOutbox"'::regclass AND conname='EmailOutbox_status_check' AND pg_get_constraintdef(oid) LIKE '%CANCELED%') OR
 NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public."PasswordResetToken"'::regclass AND relrowsecurity) OR
 EXISTS(SELECT 1 FROM public."PasswordResetToken" WHERE "usedAt" IS NULL) THEN
 RAISE EXCEPTION 'Postflight incomplete; do not reconcile'; END IF;
 IF EXISTS(SELECT 1 FROM public._prisma_migrations WHERE migration_name=migration AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND checksum=expected_checksum) THEN
 RAISE NOTICE 'Matching history exists; nothing changed';
 ELSIF EXISTS(SELECT 1 FROM public._prisma_migrations WHERE migration_name=migration) THEN
 RAISE EXCEPTION 'History differs or is incomplete; do not overwrite';
 ELSE
 INSERT INTO public._prisma_migrations(id,checksum,finished_at,migration_name,started_at,applied_steps_count)
 VALUES(gen_random_uuid()::text,expected_checksum,CURRENT_TIMESTAMP,migration,CURRENT_TIMESTAMP,1);
 END IF;
END $$;
COMMIT;
