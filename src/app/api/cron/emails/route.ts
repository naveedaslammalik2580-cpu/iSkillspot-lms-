import { timingSafeEqual } from "node:crypto";
import { deliverEmails } from "@/lib/email";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET,
    supplied = request.headers.get("authorization") || "";
  const expected = `Bearer ${secret}`;
  if (
    !secret ||
    secret.length < 32 ||
    supplied.length !== expected.length ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(await deliverEmails(20));
}
