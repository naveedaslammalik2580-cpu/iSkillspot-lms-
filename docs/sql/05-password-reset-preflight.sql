-- READ ONLY. Run BEFORE applying the password-reset migration
-- (prisma/migrations/20261114084833_password_reset_tokens/migration.sql).
-- Confirms the baseline the migration expects and that it has not
-- already been applied.
BEGIN READ ONLY;

-- The table must not exist yet. Expected: 0 rows.
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'PasswordResetToken';

-- The migration this one builds on must already be recorded.
-- Expected: one finished row for the auth lifecycle migration.
SELECT migration_name, finished_at IS NOT NULL AS finished, rolled_back_at
FROM public._prisma_migrations
WHERE migration_name = '20261113120000_auth_account_lifecycle';

-- No unfinished migrations may exist. Expected: 0 rows.
SELECT migration_name, started_at FROM public._prisma_migrations
WHERE finished_at IS NULL AND rolled_back_at IS NULL;

-- Business invariants that must be identical after the migration.
SELECT count(*) AS user_count FROM public."User";
SELECT count(*) AS super_admin_count FROM public."User" WHERE role = 'SUPER_ADMIN';

COMMIT;
