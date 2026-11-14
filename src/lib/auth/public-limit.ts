import { headers } from "next/headers";
import { rateLimited } from "./throttle";
export async function publicLimit(scope: string, email = "") {
  const h = await headers();
  // Configure only a header overwritten by the deployment's trusted proxy.
  const ip = process.env.AUTH_TRUSTED_IP_HEADER
    ? h.get(process.env.AUTH_TRUSTED_IP_HEADER)?.split(",")[0]?.trim()
    : null;
  const [address, source] = await Promise.all([
    rateLimited(`${scope}:email:${email}`),
    rateLimited(`${scope}:source:${ip || "unconfigured-proxy"}`),
  ]);
  return address || source;
}
