"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createAnnouncement, updateAnnouncement } from "@/lib/actions/announcements";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type BatchOption = { id: string; code: string; name: string; courseTitle: string };
type CourseOption = { id: string; code: string; name: string };
type Audience = "ALL" | "STUDENTS" | "TEACHERS" | "BATCH" | "COURSE";

export function AnnouncementForm({
  batches,
  courses,
  announcement,
}: {
  batches: BatchOption[];
  courses: CourseOption[];
  announcement?: {
    id: string;
    title: string;
    body: string;
    audience: Audience;
    targetBatchId: string | null;
    targetCourseId: string | null;
    status: string;
    audienceLabel: string;
    targetBatchName: string | null;
    targetCourseName: string | null;
  };
}) {
  const router = useRouter();
  const isPublishedEdit = announcement?.status === "PUBLISHED";
  const [audience, setAudience] = useState<Audience>(announcement?.audience ?? "ALL");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const body = String(fd.get("body") || "");

    let res;
    if (isPublishedEdit) {
      res = await updateAnnouncement({ id: announcement!.id, body });
    } else {
      const payload = {
        title: String(fd.get("title") || ""),
        body,
        audience,
        targetBatchId: audience === "BATCH" ? String(fd.get("targetBatchId") || "") : undefined,
        targetCourseId: audience === "COURSE" ? String(fd.get("targetCourseId") || "") : undefined,
      };
      res = announcement
        ? await updateAnnouncement({ id: announcement.id, ...payload })
        : await createAnnouncement({ ...payload, publishNow: fd.get("publishNow") === "on" });
    }

    setPending(false);
    if (res.ok) {
      router.push(`/admin/announcements/${res.announcementId}`);
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Announcement</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {isPublishedEdit ? (
            <>
              <div className="space-y-2 sm:col-span-2">
                <Label>Title (frozen after publish)</Label>
                <p className="text-sm font-medium">{announcement!.title}</p>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Audience (frozen after publish)</Label>
                <p className="text-sm font-medium">
                  {announcement!.audienceLabel}
                  {announcement!.targetBatchName && ` — ${announcement!.targetBatchName}`}
                  {announcement!.targetCourseName && ` — ${announcement!.targetCourseName}`}
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="title">Title *</Label>
                <Input id="title" name="title" required minLength={3} maxLength={200} defaultValue={announcement?.title} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="audience">Audience *</Label>
                <select
                  id="audience"
                  name="audience"
                  required
                  value={audience}
                  onChange={(e) => setAudience(e.target.value as Audience)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="ALL">Everyone</option>
                  <option value="STUDENTS">All students</option>
                  <option value="TEACHERS">All teachers</option>
                  <option value="BATCH">One batch</option>
                  <option value="COURSE">One course</option>
                </select>
              </div>
              {audience === "BATCH" && (
                <div className="space-y-2">
                  <Label htmlFor="targetBatchId">Batch *</Label>
                  <select
                    id="targetBatchId" name="targetBatchId" required
                    defaultValue={announcement?.targetBatchId ?? ""}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Select batch</option>
                    {batches.map((b) => (
                      <option key={b.id} value={b.id}>{b.courseTitle} — {b.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {audience === "COURSE" && (
                <div className="space-y-2">
                  <Label htmlFor="targetCourseId">Course *</Label>
                  <select
                    id="targetCourseId" name="targetCourseId" required
                    defaultValue={announcement?.targetCourseId ?? ""}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Select course</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="body">Message *</Label>
            <textarea
              id="body"
              name="body"
              required
              minLength={10}
              maxLength={10_000}
              rows={6}
              defaultValue={announcement?.body}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          {!announcement && (
            <div className="flex items-center gap-2 sm:col-span-2">
              <input type="checkbox" id="publishNow" name="publishNow" className="h-4 w-4" />
              <Label htmlFor="publishNow" className="font-normal">Publish immediately (otherwise saved as draft)</Label>
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : announcement ? "Save changes" : "Create announcement"}
        </Button>
        <Button type="button" variant="outline" asChild>
          <Link href={announcement ? `/admin/announcements/${announcement.id}` : "/admin/announcements"}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
