import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Mirrors the layout in ./page.tsx (primary + secondary stat rows, chart +
 * status cards, at-risk + activity cards) so there's no layout shift when
 * real data lands.
 */
export default function AdminDashboardLoading() {
  return (
    <>
      <div className="mb-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-2 h-4 w-64" />
      </div>

      {/* Primary row (4 cards) */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-5">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="h-6 w-14" />
              </div>
              <Skeleton className="h-11 w-11 rounded-lg" />
            </div>
          </Card>
        ))}
      </div>

      {/* Secondary row (4 compact cards) */}
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
              <div className="min-w-0 space-y-1.5">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-5 w-10" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
          <CardContent><Skeleton className="h-64 w-full" /></CardContent>
        </Card>
        <Card>
          <CardHeader><Skeleton className="h-5 w-28" /></CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-6" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* At-risk panel keeps its amber accent stripe even while loading,
            so the distinct treatment doesn't "pop in" after the header. */}
        <Card className="border-l-4 border-l-amber-400">
          <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
          <CardContent className="space-y-2">
            {Array.from({ length: 4 }).map((_, j) => (
              <Skeleton key={j} className="h-12 w-full" />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
          <CardContent className="space-y-2">
            {Array.from({ length: 4 }).map((_, j) => (
              <Skeleton key={j} className="h-12 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
