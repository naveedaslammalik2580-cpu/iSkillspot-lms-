import type { MetadataRoute } from "next";

/**
 * PWA manifest. Colors come from the app's own design tokens
 * (globals.css: --primary 221 83% 45% = #1450D2; --background = #F8FAFC).
 * The icon is the iSkillSpot logo mark (the gold graduate figure on
 * navy, public/icon.png) — the same artwork as the browser favicon.
 * The service worker performs no caching, so installing the
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
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
