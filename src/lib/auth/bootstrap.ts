// Operator-only service. Never imported by a page, route or server action.
import type { PrismaClient } from "@prisma/client";
import { emailSchema, usernameSchema, assertIdentityAvailable } from "./identity";
import { hashPassword, strongPassword, temporaryPasswordExpiry } from "./password";

export async function inspectBootstrap(client: PrismaClient) {
  return client.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const count = await tx.user.count({ where: { role: "SUPER_ADMIN" } });
    const [table] = await tx.$queryRaw<{ present: boolean }[]>`SELECT to_regclass('public."AccountBootstrap"') IS NOT NULL AS present`;
    const marker = table.present ? await tx.accountBootstrap.count() : 0;
    return { superAdminExists: count > 0, alreadyBootstrapped: marker > 0, migrationReady: table.present };
  });
}

export async function bootstrapSuperAdmin(client: PrismaClient, input: { email: string; username: string; password: string }) {
  const email = emailSchema.parse(input.email);
  const username = usernameSchema.parse(input.username);
  strongPassword.parse(input.password);
  const passwordHash = await hashPassword(input.password);
  return client.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(752091, 1)`;
    if (await tx.accountBootstrap.count() || await tx.user.count({ where: { role: "SUPER_ADMIN" } })) {
      return { created: false as const };
    }
    await assertIdentityAvailable(tx, email, username);
    const user = await tx.user.create({ data: { email, username, passwordHash, role: "SUPER_ADMIN", status: "ACTIVE",
      mustChangePassword: true, passwordExpiresAt: temporaryPasswordExpiry() } });
    await tx.accountBootstrap.create({ data: { id: "initial-super-admin", userId: user.id } });
    await tx.auditLog.create({ data: { userId: user.id, action: "Bootstrapped initial SUPER_ADMIN", entity: "User", entityId: user.id } });
    return { created: true as const };
  }, { timeout: 15000 });
}
