import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_NAME, verifyToken } from "@/lib/auth/token";

// Route prefixes and the roles allowed to reach them.
const RULES: { prefix: string; roles: string[] }[] = [
  { prefix: "/admin", roles: ["SUPER_ADMIN", "ADMIN"] },
  { prefix: "/teacher", roles: ["TEACHER"] },
  { prefix: "/student", roles: ["STUDENT"] },
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const rule = RULES.find((r) => pathname.startsWith(r.prefix));
  if (!rule) return NextResponse.next();

  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  try {
    const payload = await verifyToken(token);
    const role = payload.role as string;

    if (!rule.roles.includes(role)) {
      return NextResponse.redirect(new URL("/forbidden", req.url));
    }

    // Force password change on first login before anything else.
    if (
      payload.mustChangePassword === true &&
      !pathname.startsWith("/student/change-password") &&
      !pathname.startsWith("/change-password")
    ) {
      const target = role === "STUDENT" ? "/student/change-password" : "/change-password";
      if (pathname !== target) {
        return NextResponse.redirect(new URL(target, req.url));
      }
    }

    return NextResponse.next();
  } catch {
    // A cookie was presented but did not verify (expired or no longer
    // valid): send the user to login with an explanation instead of a
    // bare redirect, and clear the dead cookie.
    const res = NextResponse.redirect(new URL("/login?expired=1", req.url));
    res.cookies.delete(COOKIE_NAME);
    return res;
  }
}

export const config = {
  matcher: ["/admin/:path*", "/teacher/:path*", "/student/:path*"],
};
