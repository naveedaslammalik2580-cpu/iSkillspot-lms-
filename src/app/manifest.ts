import type { MetadataRoute } from "next";

/**
 * PWA manifest. Colors come from the app's own design tokens
 * (globals.css: --primary 221 83% 45% = #1450D2; --background = #F8FAFC).
 * Icons reuse the existing brand mark (the graduation-cap glyph on the
 * primary tile, as rendered in the AppShell header) — no new logo was
 * created. The service worker performs no caching, so installing the
 * PWA gives home-screen access + push, not offline LMS data.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "iSkillSpot LMS",
    short_name: "iSkillSpot",
    description: "Learning Management System for iSkillSpot institute.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F8FAFC",
    theme_color: "#1450D2",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
