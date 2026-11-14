import { NextResponse, type NextRequest } from "next/server";
import { getLessonResourceAccess } from "@/lib/actions/learning";

// Lesson-resource access point. Authorization happens inside
// getLessonResourceAccess (enrolled student / assigned teacher / staff)
// before any redirect target is produced: external fileUrls are validated
// http(s) links, storage keys become short-lived signed URLs. Mirrors the
// assignment-file download route's pattern.
export async function GET(req: NextRequest) {
  const resourceId = req.nextUrl.searchParams.get("resourceId");

  if (!resourceId) {
    return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  // requireSession() inside the action redirects an unauthenticated
  // request to /login on its own — do NOT wrap this call in try/catch,
  // that would swallow next/navigation's redirect() throw.
  const result = await getLessonResourceAccess(resourceId);
  if (!result.ok) {
    return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.redirect(result.url, { status: 302, headers: { "Cache-Control": "no-store" } });
}
