import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guards";
import { manageableRoles } from "@/lib/auth/account-policy";

export async function listAccounts(search = "", page = 1) {
  const session = await requirePermission("account.manage");
  const currentPage = Number.isSafeInteger(page) && page > 0 ? Math.min(page, 100000) : 1;
  const query = search.trim().slice(0, 254);
  const where: Prisma.UserWhereInput = {
    role: { in: manageableRoles(session.role) },
    ...(query ? { OR: [{ username: { contains: query, mode: "insensitive" } }, { email: { contains: query, mode: "insensitive" } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.user.findMany({ where, select: { id: true, username: true, email: true, role: true, status: true,
      createdAt: true, lastLogin: true, mustChangePassword: true, passwordExpiresAt: true,
      teacher: { select: { id: true, fullName: true } }, student: { select: { id: true, fullName: true, studentId: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 20, skip: (currentPage - 1) * 20 }),
    db.user.count({ where }),
  ]);
  return { rows, total, page: currentPage, pages: Math.max(1, Math.ceil(total / 20)) };
}
