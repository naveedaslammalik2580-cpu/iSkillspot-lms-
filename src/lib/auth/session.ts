import { SignJWT } from "jose";
import { cookies } from "next/headers";
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

export async function getSession(): Promise<SessionPayload | null> {
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
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export { COOKIE_NAME, getSecret };
