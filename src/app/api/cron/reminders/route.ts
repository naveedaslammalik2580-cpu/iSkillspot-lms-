import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runAllReminders } from "@/lib/reminders";

/**
 * Protected reminder trigger for an external scheduler.
 *
 * Deployment wiring (NOT enabled by this code alone): point any external
 * cron (e.g. a server crontab, GitHub Actions schedule, or a cron SaaS)
 * at POST https://<your-domain>/api/cron/reminders with the header
 *   x-cron-secret: <CRON_SECRET>
 * Recommended cadence: once or twice daily. The endpoint is disabled
 * (503) until CRON_SECRET is set, rejects bad secrets (401), and every
 * run is idempotent thanks to notification dedupe keys.
 */
function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "Reminders endpoint is not configured." }, { status: 503 });
  }
  if (!secretMatches(req.headers.get("x-cron-secret"), secret)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  const results = await runAllReminders(new Date());
  return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), results });
}

export async function GET() {
  return NextResponse.json({ ok: false, error: "Method not allowed. Use POST with the cron secret header." }, { status: 405 });
}
