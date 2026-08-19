import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "iSkillSpot LMS",
  description: "Learning Management System for iSkillSpot institute.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}
