const { PrismaClient } = require("@prisma/client");
const assert = require("node:assert/strict");
exports.prepare = async function (connection) {
  const url = new URL(connection);
  assert.ok(
    url.hostname === "127.0.0.1" &&
      url.pathname.startsWith("/iskillspot_auth_test_") &&
      url.pathname.endsWith("_manual"),
  );
  const db = new PrismaClient({ datasourceUrl: connection, log: [] });
  try {
    // Simulate a PR #5 deployment with a live legacy reset link and public default grants.
    await db.$executeRaw`INSERT INTO "PasswordResetToken" (id,"userId","tokenHash","expiresAt") VALUES ('legacy-reset-link','legacy-student','legacy-digest',CURRENT_TIMESTAMP+INTERVAL '1 hour')`;
    await db.$executeRawUnsafe(
      'GRANT SELECT, INSERT ON "PasswordResetToken" TO anon, authenticated',
    );
  } finally {
    await db.$disconnect();
  }
};
