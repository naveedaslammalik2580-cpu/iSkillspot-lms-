-- READ ONLY. Run after the migration, before deploying the updated application.
BEGIN READ ONLY;
SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
WHERE table_schema='public' AND table_name='User' AND column_name IN ('sessionVersion','passwordExpiresAt');
SELECT indexname FROM pg_indexes WHERE schemaname='public'
AND indexname IN ('User_username_normalized_key','User_email_normalized_key','AuthThrottle_expiresAt_idx','AccountBootstrap_userId_key');
SELECT tgname, tgenabled FROM pg_trigger
WHERE tgrelid='public."User"'::regclass AND tgname='User_revoke_changed_credentials';
SELECT relname, relrowsecurity FROM pg_class JOIN pg_namespace ON pg_namespace.oid=pg_class.relnamespace
WHERE nspname='public' AND relname IN ('User','AuthThrottle','AccountBootstrap');
SELECT r.rolname, c.relname,
       has_table_privilege(r.rolname, c.oid, 'SELECT') AS can_select,
       has_table_privilege(r.rolname, c.oid, 'UPDATE') AS can_update
FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE r.rolname IN ('anon','authenticated') AND n.nspname='public'
AND c.relname IN ('User','AuthThrottle','AccountBootstrap');
SELECT count(*) FILTER (WHERE "mustChangePassword" AND "passwordExpiresAt" IS NULL) AS temporary_accounts_missing_expiry,
       count(*) FILTER (WHERE "sessionVersion" < 0) AS invalid_versions
FROM public."User";
SELECT 'User' AS entity, count(*) FROM public."User"
UNION ALL SELECT 'Student', count(*) FROM public."Student"
UNION ALL SELECT 'Teacher', count(*) FROM public."Teacher"
UNION ALL SELECT 'Fee', count(*) FROM public."Fee"
UNION ALL SELECT 'Payment', count(*) FROM public."Payment"
UNION ALL SELECT 'Certificate', count(*) FROM public."Certificate";
SELECT count(*) AS super_admin_count FROM public."User" WHERE role='SUPER_ADMIN';
SELECT count(*) AS bootstrap_markers FROM public."AccountBootstrap";
COMMIT;
