import { Badge } from "@/components/ui/badge";

const MAP: Record<string, "default" | "success" | "warning" | "danger" | "neutral"> = {
  ACTIVE: "success",
  COMPLETED: "default",
  ON_HOLD: "warning",
  DROPPED: "danger",
  SUSPENDED: "danger",
  PAID: "success",
  PARTIAL: "warning",
  UNPAID: "neutral",
  OVERDUE: "danger",
  PRESENT: "success",
  ABSENT: "danger",
  LATE: "warning",
  EXCUSED: "neutral",
  GRADED: "success",
  SUBMITTED: "default",
  PENDING: "neutral",
  ISSUED: "success",
  REVOKED: "danger",
  DRAFT: "neutral",
  PUBLISHED: "success",
  ARCHIVED: "danger",
  UPCOMING: "default",
  ONGOING: "success",
  CANCELLED: "danger",
};

export function StatusBadge({ status }: { status: string }) {
  const variant = MAP[status] ?? "neutral";
  return <Badge variant={variant}>{status.replace(/_/g, " ").toLowerCase()}</Badge>;
}
