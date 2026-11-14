"use client";

import { useEffect } from "react";

/**
 * Registers the shared service worker (/sw.js) site-wide so push
 * subscriptions and PWA installability work from any page. The worker
 * itself performs no caching (see public/sw.js), so this is safe on
 * authenticated pages.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Push/PWA are progressive enhancements; failure is non-fatal.
      });
    }
  }, []);
  return null;
}
