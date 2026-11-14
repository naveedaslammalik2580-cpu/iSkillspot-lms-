-- READ ONLY. Save counts and verify the selected project before migration.
BEGIN READ ONLY;
SELECT current_database(), current_user;
SELECT migration_name, checksum, finished_at, rolled_back_at
FROM public._prisma_migrations ORDER BY started_at;
SELECT 'User' AS entity, count(*) FROM public."User"
UNION ALL SELECT 'Student', count(*) FROM public."Student"
UNION ALL SELECT 'Enrollment', count(*) FROM public."Enrollment"
UNION ALL SELECT 'Fee', count(*) FROM public."Fee"
UNION ALL SELECT 'Payment', count(*) FROM public."Payment"
UNION ALL SELECT 'Certificate', count(*) FROM public."Certificate";
-- Review legacy transaction duplicates. This migration does not rewrite any.
SELECT upper(regexp_replace(btrim("transactionReference"), '[[:space:]]+', ' ', 'g')) AS reference,
 count(*) FROM public."Payment" WHERE nullif(btrim("transactionReference"),'') IS NOT NULL
GROUP BY 1 HAVING count(*) > 1;
SELECT count(*) AS orphaned_enrollments FROM public."Enrollment" e
JOIN public."Batch" b ON b.id=e."batchId" WHERE e."courseId"<>b."courseId";
SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname;
DO $$ BEGIN
  IF to_regclass('public."AuthThrottle"') IS NULL OR
     NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='User' AND column_name='sessionVersion') THEN
    RAISE EXCEPTION 'Apply and verify the existing auth lifecycle migration first';
  END IF;
END $$;
COMMIT;
