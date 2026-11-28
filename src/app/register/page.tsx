import Link from "next/link";
import { PublicShell } from "@/components/admissions/public-shell";
import { buttonVariants } from "@/components/ui/button";

/**
 * Registration now happens ONLY through the enrollment form on the
 * institute website (accounts created there are pre-verified). This page
 * is kept as a signpost so old links/bookmarks land somewhere helpful
 * instead of a dead registration form. The registerStudent back end and
 * the verify-email flow remain in place for existing unverified accounts.
 */
const WEBSITE_ENROLL_URL = "https://iskillspot.com/enroll.html";

export default function RegisterPage() {
  return (
    <PublicShell title="Admissions are on our website">
      <p className="text-sm text-muted-foreground">
        Student registration has moved to the iSkillSpot website. Complete
        the enrollment form there and the institute will confirm your
        admission.
      </p>
      <Link
        href={WEBSITE_ENROLL_URL}
        className={buttonVariants({ className: "mt-6 w-full" })}
      >
        Enroll on the iSkillSpot website
      </Link>
      <p className="mt-4 text-sm text-muted-foreground">
        Already admitted? Use the Sign in link below to open your student
        portal.
      </p>
    </PublicShell>
  );
}
