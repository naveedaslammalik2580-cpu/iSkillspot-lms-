-- READ ONLY. Run before any missing feature migrations. Save all results.
BEGIN READ ONLY;
SELECT current_database() AS database, current_user AS operator;
SELECT migration_name, checksum, finished_at, rolled_back_at FROM public._prisma_migrations ORDER BY started_at;
SELECT 'User' AS entity,count(*) FROM public."User"
UNION ALL SELECT 'Student',count(*) FROM public."Student"
UNION ALL SELECT 'Teacher',count(*) FROM public."Teacher"
UNION ALL SELECT 'Enrollment',count(*) FROM public."Enrollment"
UNION ALL SELECT 'Fee',count(*) FROM public."Fee"
UNION ALL SELECT 'Payment',count(*) FROM public."Payment"
UNION ALL SELECT 'Attendance',count(*) FROM public."Attendance"
UNION ALL SELECT 'AssignmentSubmission',count(*) FROM public."AssignmentSubmission"
UNION ALL SELECT 'Grade',count(*) FROM public."Grade"
UNION ALL SELECT 'Certificate',count(*) FROM public."Certificate";
SELECT to_regclass('public."PasswordResetToken"') AS legacy_reset_table,
 to_regclass('public."AuthToken"') AS unified_tokens,
 to_regclass('public."Admission"') AS admissions,
 to_regclass('public."EmailOutbox"') AS outbox;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL) THEN
  RAISE EXCEPTION 'An unfinished migration requires operator review'; END IF;
 IF EXISTS(SELECT 1 FROM public."User" GROUP BY lower(btrim(email)) HAVING count(*)>1) THEN
  RAISE EXCEPTION 'Resolve duplicate identities explicitly before deployment'; END IF;
END $$;
COMMIT;
