BEGIN READ ONLY;
DO $$ BEGIN
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND
     ((table_name='User' AND column_name IN ('admissionRequired','emailVerifiedAt')) OR
      (table_name='Course' AND column_name IN ('admissionsOpen','admissionPayment')) OR
      (table_name='Enrollment' AND column_name='accessSuspended') OR
      (table_name='Payment' AND column_name='referenceKey'))) <> 6 THEN
    RAISE EXCEPTION 'Admissions columns incomplete';
  END IF;
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN ('Admission','AuthToken','EmailOutbox') AND c.relrowsecurity) <> 3 THEN
    RAISE EXCEPTION 'Admissions tables or RLS incomplete';
  END IF;
  IF (SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname IN
      ('Admission_open_course_key','Admission_one_draft_key','Payment_referenceKey_key','AuthToken_digest_key','EmailOutbox_dedupeKey_key')) <> 5 THEN
    RAISE EXCEPTION 'Admissions unique indexes incomplete';
  END IF;
END $$;
SELECT 'User' AS entity, count(*) FROM public."User"
UNION ALL SELECT 'Student', count(*) FROM public."Student"
UNION ALL SELECT 'Enrollment', count(*) FROM public."Enrollment"
UNION ALL SELECT 'Fee', count(*) FROM public."Fee"
UNION ALL SELECT 'Payment', count(*) FROM public."Payment"
UNION ALL SELECT 'Certificate', count(*) FROM public."Certificate";
SELECT count(*) FILTER (WHERE "admissionRequired") AS restricted_accounts FROM public."User";
SELECT count(*) FILTER (WHERE "accessSuspended") AS suspended_enrollments FROM public."Enrollment";
SELECT count(*) FILTER (WHERE "admissionsOpen") AS open_courses FROM public."Course";
-- Immediately after migration these three counts should be zero.
COMMIT;
