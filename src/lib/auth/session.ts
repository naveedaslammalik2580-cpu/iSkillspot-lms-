import { SignJWT } from "jose";
import { cookies } from "next/headers";
import { cache } from "react";
import { db } from "@/lib/db";
import { COOKIE_NAME, getSecret, verifyToken, type SessionPayload } from "./token";
export type { SessionPayload };

const DEFAULT_MAX_AGE = 60 * 60 * 8; // 8 hours
const REMEMBER_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function createSession(
  payload: SessionPayload,
  remember = false
): Promise<void> {
  const maxAge = remember ? REMEMBER_MAX_AGE : DEFAULT_MAX_AGE;
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${maxAge}s`)
    .sign(getSecret());

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
}

/**
 * Per-request de-duplication: the portal layout's guard, the page's own
 * guard, and any server actions in the same request all call getSession().
 * Without cache(), each call re-ran the user + teacher/student relation
 * queries below (measured: 3 statements per call, 2+ calls per navigation —
 * pure latency multiplication against a remote database). cache() scopes
 * the result to a single request, so the "authorize from current DB state"
 * guarantee is unchanged across requests; within one request the session
 * cannot legitimately change underneath a reader (the one flow that bumps
 * sessionVersion — password change — builds its new session from the update
 * result, never from a getSession() re-read).
 */
export const getSession = cache(async (): Promise<SessionPayload | null> => {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  let claims: SessionPayload;
  try { claims = await verifyToken(token); } catch { return null; }
  // Authorize from current DB state on every server read/action. Outages fail closed.
  const user = await db.user.findUnique({ where: { id: claims.userId }, select: {
    id: true, username: true, role: true, status: true, sessionVersion: true,
    mustChangePassword: true, passwordExpiresAt: true, admissionRequired: true,
    teacher: { select: { status: true } }, student: { select: { status: true } },
  } });
  if (!user || user.status !== "ACTIVE" || user.role !== claims.role || user.sessionVersion !== claims.sessionVersion ||
      (user.role === "TEACHER" && (!user.teacher || user.teacher.status !== "ACTIVE")) ||
      (user.role === "STUDENT" && (!user.student || ["SUSPENDED", "DROPPED"].includes(user.student.status))) ||
      (user.mustChangePassword && user.passwordExpiresAt && user.passwordExpiresAt.getTime() <= Date.now())) return null;
  return { userId: user.id, username: user.username, role: user.role,
    mustChangePassword: user.mustChangePassword, sessionVersion: user.sessionVersion, admissionRequired: user.admissionRequired };
});

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export { COOKIE_NAME, getSecret };
