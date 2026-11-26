import {
  websiteEnrollCourses,
  submitWebsiteEnrollment,
} from "@/lib/website-enroll";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The marketing website calls this endpoint cross-origin from the
// student's browser. Allowed origins come from ENROLL_ALLOWED_ORIGIN
// (comma-separated; default https://iskillspot.com). Outside production,
// http://localhost / 127.0.0.1 origins on any port are also allowed so the
// flow can be checked locally with the static site served next to the LMS.
function allowedOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  const configured = (process.env.ENROLL_ALLOWED_ORIGIN || "https://iskillspot.com")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (configured.includes(origin)) return origin;
  if (
    process.env.NODE_ENV !== "production" &&
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  )
    return origin;
  return null;
}

function corsHeaders(request: Request): Headers {
  const headers = new Headers();
  const origin = allowedOrigin(request);
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return headers;
}

function json(request: Request, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(request) });
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET(request: Request) {
  try {
    return json(request, await websiteEnrollCourses());
  } catch {
    return json(
      request,
      {
        admissionsOpen: false,
        courses: [],
        error: "Enrollment is temporarily unavailable. Please try again later.",
      },
      500,
    );
  }
}

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json(request, { ok: false, error: "Invalid request body." }, 400);
  }
  // Same posture as src/lib/auth/public-limit.ts: only a header the
  // deployment's trusted proxy overwrites is trusted for the client IP.
  const ipHeader = process.env.AUTH_TRUSTED_IP_HEADER;
  const clientKey = ipHeader
    ? request.headers.get(ipHeader)?.split(",")[0]?.trim() || "unknown"
    : "unconfigured-proxy";
  try {
    const result = await submitWebsiteEnrollment(raw, clientKey);
    return json(request, result.body, result.status);
  } catch {
    return json(
      request,
      { ok: false, error: "Unable to complete this request. Please try again." },
      500,
    );
  }
}
