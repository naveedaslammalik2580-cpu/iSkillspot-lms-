BEGIN READ ONLY;
DO $$ DECLARE role_name text; table_name text; BEGIN
 IF NOT EXISTS(SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name='AuthToken' AND c.column_name='requestedById') THEN
  RAISE EXCEPTION 'Unified AuthToken column missing'; END IF;
 IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname='public' AND c.relname IN ('PasswordResetToken','AuthToken','Admission','EmailOutbox') AND c.relrowsecurity)<>4 THEN
  RAISE EXCEPTION 'Expected all four server-only tables with RLS'; END IF;
 IF EXISTS(SELECT 1 FROM public."PasswordResetToken" WHERE "usedAt" IS NULL) THEN
  RAISE EXCEPTION 'Legacy reset links have not been retired'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public."EmailOutbox"'::regclass AND conname='EmailOutbox_status_check' AND pg_get_constraintdef(oid) LIKE '%CANCELED%') THEN
  RAISE EXCEPTION 'Outbox state constraint incomplete'; END IF;
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
   FOREACH table_name IN ARRAY ARRAY['PasswordResetToken','AuthToken','Admission','EmailOutbox'] LOOP
    IF has_table_privilege(role_name,format('public.%I',table_name),'SELECT') OR has_table_privilege(role_name,format('public.%I',table_name),'INSERT') OR has_table_privilege(role_name,format('public.%I',table_name),'UPDATE') OR has_table_privilege(role_name,format('public.%I',table_name),'DELETE') THEN
     RAISE EXCEPTION 'Unexpected API grant on % for %',table_name,role_name; END IF;
   END LOOP;
  END IF;
 END LOOP;
END $$;
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
SELECT count(*) AS preserved_legacy_reset_history FROM public."PasswordResetToken";
COMMIT;
