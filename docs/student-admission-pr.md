Public students can now register with their own password, verify their email, choose an open database course and follow official manual payment instructions. Pending accounts can sign in to an admission status page; academic pages and APIs remain restricted until ADMIN/SUPER_ADMIN verifies the actual transaction and approves the application.

Approval atomically records the existing fee/payment, enrollment, activation, audit and confirmation-email queue entry. Adds course-level suspension, tighter enrollment scope across student views, branded email/recovery infrastructure and additive SQL deployment/preflight/postflight/history instructions. Existing accounts retain access by default; public admissions start closed.

Validation and deployment details: [student admission report](docs/student-admission-system-report.md). The shared Supabase database was not changed. Apply the additive migration and configure email, worker scheduling and official admission settings before opening admissions.

Executed validation: production build, TypeScript and ESLint (zero errors, three existing warnings); 97 passing unit/integration/browser checks (9 auth unit, 25 auth lifecycle/browser, 41 learning/notification/financial/upload regressions, 22 admissions checks). Both Prisma and manual SQL migration/history workflows passed on separate disposable PostgreSQL databases, preserving legacy fixtures. Mobile and desktop screenshots were visually reviewed. Actual external inbox delivery remains a deployment check.

Related: open recovery PR #5 overlaps token/email/routes. This implementation is based on current main; reconcile that PR before merging both.
