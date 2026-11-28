"use client";

import { useEffect } from "react";
import Link from "next/link";

// Last-resort error page: renders when the root layout itself fails, so it
// cannot rely on the app layout, Tailwind, or shared components. Styling is
// inline and kept to the iSkillSpot brand blue (#1450D2).
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          backgroundColor: "#f4f7fc",
          color: "#0f172a",
          padding: "24px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            maxWidth: "28rem",
            width: "100%",
            textAlign: "center",
            backgroundColor: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            padding: "32px",
            boxSizing: "border-box",
          }}
        >
          <h1 style={{ fontSize: "1.125rem", fontWeight: 600, margin: "0 0 4px" }}>Something went wrong</h1>
          <p style={{ fontSize: "0.875rem", color: "#64748b", margin: "0 0 20px" }}>
            This page couldn&apos;t load. Try again, or go back to your dashboard.
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: "8px" }}>
            <Link
              href="/"
              style={{
                display: "inline-block",
                padding: "8px 16px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                color: "#0f172a",
                textDecoration: "none",
                fontSize: "0.875rem",
                fontWeight: 500,
              }}
            >
              Go to my dashboard
            </Link>
            <button
              onClick={() => reset()}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                border: "none",
                backgroundColor: "#1450D2",
                color: "#ffffff",
                fontSize: "0.875rem",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
