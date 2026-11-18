import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { AssignmentAttachment } from "@/lib/assignment-attachment";
import { FileText } from "lucide-react";

/**
 * "Task file (PDF)" card shown on assignment detail pages (admin +
 * student) when the assignment has a practical-task attachment.
 * Uploaded files are served through the signed-URL route (the raw
 * storage key is never a public link); URL attachments link directly.
 */
export function TaskFileCard({
  assignmentId,
  attachment,
}: {
  assignmentId: string;
  attachment: AssignmentAttachment;
}) {
  const href =
    attachment.kind === "upload"
      ? `/api/assignments/task-file?assignmentId=${assignmentId}&key=${encodeURIComponent(attachment.key)}`
      : attachment.url;

  return (
    <Card className="mb-6 border-primary/30 bg-primary/5">
      <CardContent className="flex flex-wrap items-center gap-4 p-6">
        <FileText className="h-8 w-8 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">Task file (PDF)</p>
          <p className="truncate font-medium">{attachment.name}</p>
          <p className="text-xs text-muted-foreground">
            Open this file first — it contains your practical task.
          </p>
        </div>
        <Button asChild>
          <a href={href} target="_blank" rel="noreferrer">
            Open / Download
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}
