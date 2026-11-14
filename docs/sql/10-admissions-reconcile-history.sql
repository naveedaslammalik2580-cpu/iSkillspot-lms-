-- Run only AFTER exact migration SQL and postflight succeed. Never edit existing history.
BEGIN;
DO $$
DECLARE migration CONSTANT text := '20261114120000_student_admissions';
expected_checksum CONSTANT text := 'e1f4adfa92848500e59cb0c23bd59e616a7db7d386680e4ff6dc1b9b89d1752f';
BEGIN
 PERFORM pg_advisory_xact_lock(752091, 4);
 IF to_regclass('public."Admission"') IS NULL OR to_regclass('public."AuthToken"') IS NULL OR to_regclass('public."EmailOutbox"') IS NULL OR
 (SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname IN ('Admission_open_course_key','Admission_one_draft_key','Payment_referenceKey_key')) <> 3 THEN
 RAISE EXCEPTION 'Postflight incomplete; do not reconcile'; END IF;
 IF EXISTS(SELECT 1 FROM public._prisma_migrations WHERE migration_name=migration AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND checksum=expected_checksum) THEN
 RAISE NOTICE 'Matching history exists; nothing changed';
 ELSIF EXISTS(SELECT 1 FROM public._prisma_migrations WHERE migration_name=migration) THEN
 RAISE EXCEPTION 'History differs or is incomplete. Do not overwrite';
 ELSE
 INSERT INTO public._prisma_migrations (id,checksum,finished_at,migration_name,started_at,applied_steps_count)
 VALUES(gen_random_uuid()::text,expected_checksum,CURRENT_TIMESTAMP,migration,CURRENT_TIMESTAMP,1);
 END IF;
END $$;
COMMIT;
