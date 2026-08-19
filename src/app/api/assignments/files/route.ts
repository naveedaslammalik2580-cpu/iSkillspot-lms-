import { NextResponse, type NextRequest } from "next/server";
import { getSubmissionFileSignedUrl } from "@/lib/actions/assignments";

// AssignmentSubmission.fileUrl stores a JSON array of storage keys (no
// separate SubmissionFile model/id), so this routes on submissionId+key via
// query params rather than a path segment.
export async function GET(req: NextRequest) {
  const submissionId = req.nextUrl.searchParams.get("submissionId");
  const key = req.nextUrl.searchParams.get("key");

  if (!submissionId || !key) {
    return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  // requireSession() inside this redirects an unauthenticated request to
  // /login on its own, same as every page in the app — do NOT wrap this call
  // in try/catch, that would swallow next/navigation's redirect() throw.
  const result = await getSubmissionFileSignedUrl(submissionId, key);
  if (!result.ok) {
    return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.redirect(result.url, { status: 302, headers: { "Cache-Control": "no-store" } });
}
