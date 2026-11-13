-- READ ONLY. Run before the migration in the intended Supabase project.
BEGIN READ ONLY;
SELECT current_database() AS database, current_schema() AS schema;
SELECT role, status, count(*) AS accounts FROM public."User" GROUP BY role, status;
-- Must return zero rows. Resolve duplicates explicitly before migrating.
SELECT 'email' AS field, count(*) AS duplicate_count FROM public."User"
GROUP BY lower(btrim(email)) HAVING count(*) > 1
UNION ALL
SELECT 'username', count(*) FROM public."User"
GROUP BY lower(btrim(username)) HAVING count(*) > 1;
-- Whitespace identities need operator review; migration does not rewrite them.
SELECT count(*) FILTER (WHERE email <> btrim(email)) AS emails_with_spaces,
       count(*) FILTER (WHERE username <> btrim(username)) AS usernames_with_spaces,
       count(*) FILTER (WHERE "mustChangePassword") AS temporary_password_accounts
FROM public."User";
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='User' AND column_name IN ('sessionVersion','passwordExpiresAt');
SELECT to_regclass('public."AuthThrottle"') AS throttle_table,
       to_regclass('public."AccountBootstrap"') AS bootstrap_table;
-- Record these counts. Compare after migration; no business records are deleted.
SELECT 'User' AS entity, count(*) FROM public."User"
UNION ALL SELECT 'Student', count(*) FROM public."Student"
UNION ALL SELECT 'Teacher', count(*) FROM public."Teacher"
UNION ALL SELECT 'Fee', count(*) FROM public."Fee"
UNION ALL SELECT 'Payment', count(*) FROM public."Payment"
UNION ALL SELECT 'Certificate', count(*) FROM public."Certificate";
SELECT migration_name, finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolled_back
FROM public._prisma_migrations ORDER BY started_at;
COMMIT;
