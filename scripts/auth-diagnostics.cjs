// Read-only shared-database inspection. Never logs connection strings or users.
const { loadEnvConfig } = require('@next/env');
loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient({ log: [] });
(async () => {
  try {
    const url = new URL(process.env.DATABASE_URL);
    const project = url.hostname.includes('pooler') ? decodeURIComponent(url.username).split('.').slice(1).join('.') : url.hostname.replace(/^db\./, '').split('.')[0];
    console.log('Configured project reference:', project);
    await db.$transaction(async tx => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '10000ms'");
      console.log('Connectivity:', await tx.$queryRaw`SELECT current_database() AS database, current_schema() AS schema`);
      console.log('LMS account counts:', await tx.$queryRaw`SELECT role, status, count(*)::int AS count FROM public."User" GROUP BY role, status`);
      console.log('Missing linked profiles:', await tx.$queryRaw`SELECT count(*) FILTER (WHERE u.role='TEACHER' AND t.id IS NULL)::int AS teachers, count(*) FILTER (WHERE u.role='STUDENT' AND s.id IS NULL)::int AS students FROM public."User" u LEFT JOIN public."Teacher" t ON t."userId"=u.id LEFT JOIN public."Student" s ON s."userId"=u.id`);
      console.log('LMS identity normalization conflicts:', await tx.$queryRaw`SELECT count(*)::int AS groups FROM (SELECT lower(trim(email)) FROM public."User" GROUP BY lower(trim(email)) HAVING count(*) > 1 UNION ALL SELECT lower(trim(username)) FROM public."User" GROUP BY lower(trim(username)) HAVING count(*) > 1) conflicts`);
      console.log('Account table API exposure:', await tx.$queryRaw`SELECT c.relrowsecurity AS rls_enabled, has_table_privilege('anon', 'public."User"', 'SELECT') AS anon_can_select, has_table_privilege('authenticated', 'public."User"', 'UPDATE') AS authenticated_can_update FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='User'`);
      console.log('User policy flags:', await tx.$queryRaw`SELECT count(*)::int AS policies, bool_or(qual='true') AS unrestricted_read_predicate, bool_or(with_check='true') AS unrestricted_write_predicate FROM pg_policies WHERE schemaname='public' AND tablename='User'`);
    }, { timeout: 25000, maxWait: 10000 });
  } catch (error) {
    console.log('Read-only inspection failed:', { name: error.name, code: error.code || error.errorCode || 'unavailable' });
    process.exitCode = 1;
  } finally { await db.$disconnect(); }
})();
