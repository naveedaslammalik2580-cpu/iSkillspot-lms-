"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Lazy boundary for the enrollment chart. Recharts is by far the heaviest
 * client dependency in the app and this chart is its only consumer, so it
 * is split out of the dashboard's initial bundle and loaded on demand
 * (ssr: false — the chart is an authenticated, below-the-fold widget).
 * The loading placeholder matches the chart's rendered height (280px,
 * see enrollment-chart.tsx) so the panel does not shift layout when the
 * chunk arrives.
 */
const EnrollmentChart = dynamic(
  () => import("./enrollment-chart").then((m) => m.EnrollmentChart),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[280px] w-full" />,
  }
);

export function EnrollmentChartLazy({
  data,
}: {
  data: { name: string; value: number }[];
}) {
  return <EnrollmentChart data={data} />;
}
