// Edge-compatible token primitives. DB validation belongs in session.ts.
import { jwtVerify } from "jose";
import type { Role } from "@prisma/client";

export const COOKIE_NAME = "isp_session";
export interface SessionPayload {
  userId: string;
  role: Role;
  username: string;
  mustChangePassword: boolean;
  sessionVersion: number;
}
export function getSecret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("SESSION_SECRET must be set and at least 32 characters long.");
  return new TextEncoder().encode(value);
}
export async function verifyToken(token: string): Promise<SessionPayload> {
  const { payload } = await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });
  if (typeof payload.userId !== "string" || !payload.userId || typeof payload.username !== "string" ||
      !["SUPER_ADMIN", "ADMIN", "TEACHER", "STUDENT"].includes(String(payload.role)) ||
      typeof payload.mustChangePassword !== "boolean" || !Number.isInteger(payload.sessionVersion) ||
      Number(payload.sessionVersion) < 0 || typeof payload.exp !== "number" || typeof payload.iat !== "number") {
    throw new Error("Invalid session");
  }
  return payload as unknown as SessionPayload;
}
