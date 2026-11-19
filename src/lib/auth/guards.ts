import { redirect } from "next/navigation";
import { cache } from "react";
import type { Role } from "@prisma/client";
import { getSession, type SessionPayload } from "./session";
import { can, isStaff, type Permission } from "./permissions";
import { db } from "@/lib/db";

/**
 * Server-only authorization guards. These are the single source of truth for
 * access control. UI hiding is cosmetic; every server action and page loader
 * calls one of these before touching data.
 */

export class AuthError extends Error {
  constructor(
    message: string,
    public code: "UNAUTHENTICATED" | "FORBIDDEN" = "FORBIDDEN"
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/** Require any authenticated session. Redirects to /login if absent. */
export async function requireSession(options: { allowAdmission?: boolean } = {}): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "STUDENT" && session.admissionRequired && !options.allowAdmission) redirect("/admission");
  return session;
}

/** Require one of the given roles. */
export async function requireRole(
  ...roles: Role[]
): Promise<SessionPayload> {
  const session = await requireSession();
  if (!roles.includes(session.role)) {
    redirect("/forbidden");
  }
  return session;
}

/** Require staff (admin or super admin). */
export async function requireStaff(): Promise<SessionPayload> {
  const session = await requireSession();
  if (!isStaff(session.role)) redirect("/forbidden");
  return session;
}

/** Require a specific capability. Redirects to /forbidden if absent. */
export async function requirePermission(
  permission: Permission
): Promise<SessionPayload> {
  const session = await requireSession();
  if (!can(session.role, permission)) {
    redirect("/forbidden");
  }
  return session;
}

/**
 * Per-request memoised Student lookup: the student layout AND the page
 * below it both call requireStudentSelf() in the same request, which used
 * to fetch the identical Student row twice per navigation.
 */
const getStudentByUserId = cache(async (userId: string) =>
  db.student.findUnique({ where: { userId } }),
);

/**
 * Resolve the Student row that belongs to the current session, or null.
 * Students may only ever read their OWN student record.
 */
export async function requireStudentSelf(options: { allowAdmission?: boolean } = {}) {
  const session = await requireSession(options);
  if (session.role !== "STUDENT") redirect("/forbidden");
  const student = await getStudentByUserId(session.userId);
  if (!student) redirect("/forbidden");
  return { session, student };
}


