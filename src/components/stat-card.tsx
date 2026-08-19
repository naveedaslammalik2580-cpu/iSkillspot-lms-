import { ICONS } from "@/lib/icons";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  icon,
  tone = "default",
  variant = "default",
}: {
  label: string;
  value: string | number;
  icon: string;
  tone?: "default" | "success" | "warning" | "danger";
  /** "compact" renders a smaller, visually quieter card for secondary/contextual
   *  stats — same data, less weight, so a primary row can stand out above it. */
  variant?: "default" | "compact";
}) {
  const Cmp = ICONS[icon];
  const toneClass = {
    default: "bg-primary/10 text-primary",
    success: "bg-green-100 text-green-700",
    warning: "bg-amber-100 text-amber-700",
    danger: "bg-red-100 text-red-700",
  }[tone];

  if (variant === "compact") {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", toneClass)}>
            {Cmp && <Cmp className="h-4 w-4" />}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-semibold">{value}</p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold">{value}</p>
        </div>
        <div className={cn("flex h-11 w-11 items-center justify-center rounded-lg", toneClass)}>
          {Cmp && <Cmp className="h-5 w-5" />}
        </div>
      </div>
    </Card>
  );
}
