import { websiteCourseCatalog } from "@/lib/website-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The marketing website calls this endpoint cross-origin from the
// visitor's browser. Same origin policy as /api/enroll: allowed origins
// come from ENROLL_ALLOWED_ORIGIN (comma-separated; default
// https://iskillspot.com). Outside production, http://localhost /
// 127.0.0.1 origins on any port are also allowed so the flow can be
// checked locally with the static site served next to the LMS.
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
  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
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
    return json(request, await websiteCourseCatalog());
  } catch {
    return json(
      request,
      { courses: [], error: "Course catalog is temporarily unavailable." },
      500,
    );
  }
}
