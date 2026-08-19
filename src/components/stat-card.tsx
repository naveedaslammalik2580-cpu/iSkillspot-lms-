import * as Icons from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  icon,
  tone = "default",
}: {
  label: string;
  value: string | number;
  icon: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const Cmp = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[icon];
  const toneClass = {
    default: "bg-primary/10 text-primary",
    success: "bg-green-100 text-green-700",
    warning: "bg-amber-100 text-amber-700",
    danger: "bg-red-100 text-red-700",
  }[tone];

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
