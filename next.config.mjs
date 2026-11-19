/**
 * Content-Security-Policy in REPORT-ONLY mode (Mission 2). The policy is
 * derived from what the app actually loads: same-origin scripts/styles
 * (Next.js streams inline RSC payloads, hence 'unsafe-inline' for now),
 * images/media from the Supabase storage project, lesson embeds only from
 * the two allowlisted video hosts the embed component itself permits
 * (youtube-nocookie, player.vimeo.com), and the same-origin service
 * worker. Report-only means browsers log violations instead of blocking,
 * so nothing can break while the policy is validated. There is currently
 * NO violation-reporting endpoint (no report-uri/report-to): violations
 * are visible only in each visitor's browser console. Before switching
 * this to the enforcing `Content-Security-Policy` header, add a
 * reporting endpoint and review collected violations.
 */
const contentSecurityPolicyReportOnly = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "media-src 'self' blob: https://*.supabase.co",
  "frame-src https://www.youtube-nocookie.com https://player.vimeo.com",
  "connect-src 'self' https://*.supabase.co",
  "worker-src 'self'",
  "manifest-src 'self'",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.LMS_BUILD_DIR || ".next",
  reactStrictMode: true,

  experimental: {
    serverActions: {
      bodySizeLimit: "200mb",
    },
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          {
            key: "Content-Security-Policy-Report-Only",
            value: contentSecurityPolicyReportOnly,
          },
        ],
      },
    ];
  },
};

export default nextConfig;