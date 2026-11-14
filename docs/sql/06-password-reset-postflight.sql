-- READ ONLY. Run AFTER the password-reset migration, before deploying
-- the updated application.
BEGIN READ ONLY;

-- Expected: 7 columns (id, userId, tokenHash, expiresAt, usedAt, requestedById, createdAt).
SELECT column_name, data_type, is_nullable FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'PasswordResetToken'
ORDER BY ordinal_position;

-- Expected: PasswordResetToken_pkey, PasswordResetToken_tokenHash_key,
-- PasswordResetToken_userId_idx, PasswordResetToken_expiresAt_idx.
SELECT indexname FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'PasswordResetToken';

-- Expected: one FK PasswordResetToken_userId_fkey -> "User"("id"), delete rule CASCADE.
SELECT conname, confdeltype FROM pg_constraint
WHERE conrelid = 'public."PasswordResetToken"'::regclass AND contype = 'f';

-- RLS posture for the new table (the token hashes are credentials-grade
-- data; anon/authenticated must have no access — the app connects via
-- Prisma as the owner role, which bypasses RLS).
SELECT relname, relrowsecurity FROM pg_class
JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
WHERE nspname = 'public' AND relname = 'PasswordResetToken';
SELECT r.rolname,
       has_table_privilege(r.rolname, 'public."PasswordResetToken"', 'SELECT') AS can_select,
       has_table_privilege(r.rolname, 'public."PasswordResetToken"', 'INSERT') AS can_insert
FROM pg_roles r WHERE r.rolname IN ('anon', 'authenticated');

-- Business invariants must match the preflight counts.
SELECT count(*) AS user_count FROM public."User";
SELECT count(*) AS super_admin_count FROM public."User" WHERE role = 'SUPER_ADMIN';

-- A freshly migrated system has issued no tokens yet. Expected: 0.
SELECT count(*) AS password_reset_tokens FROM public."PasswordResetToken";

COMMIT;
