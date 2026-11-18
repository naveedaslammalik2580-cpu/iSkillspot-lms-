import { NextResponse, type NextRequest } from "next/server";
import { getAssignmentTaskFileSignedUrl } from "@/lib/actions/assignments";

// Serves an assignment's uploaded practical-task PDF. The storage key
// comes from Assignment.attachments (kind "upload") and is only ever
// exposed to signed-in users who may see the assignment; the route
// redirects to a short-lived signed URL, mirroring /api/assignments/files.
export async function GET(req: NextRequest) {
  const assignmentId = req.nextUrl.searchParams.get("assignmentId");
  const key = req.nextUrl.searchParams.get("key");

  if (!assignmentId || !key) {
    return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  // requireSession() inside this redirects an unauthenticated request to
  // /login on its own — do NOT wrap this call in try/catch, that would
  // swallow next/navigation's redirect() throw.
  const result = await getAssignmentTaskFileSignedUrl(assignmentId, key);
  if (!result.ok) {
    return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.redirect(result.url, { status: 302, headers: { "Cache-Control": "no-store" } });
}
