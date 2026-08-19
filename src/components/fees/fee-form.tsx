"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createFee, updateFee } from "@/lib/actions/fees";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type StudentOption = { id: string; studentId: string; fullName: string };
type CourseOption = { id: string; name: string; defaultFee: number | null };

export function FeeForm({
  students,
  courses,
  fee,
}: {
  students: StudentOption[];
  courses: CourseOption[];
  fee?: {
    id: string;
    studentName: string;
    courseName: string;
    amount: number;
    discount: number;
    dueDate: string | null;
    description: string | null;
  };
}) {
  const router = useRouter();
  const amountRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onCourseChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const course = courses.find((c) => c.id === e.target.value);
    if (course?.defaultFee != null && amountRef.current && !amountRef.current.value) {
      amountRef.current.value = String(course.defaultFee);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const fd = new FormData(e.currentTarget);

    const discountRaw = String(fd.get("discount") || "");
    const payload = {
      amount: Number(fd.get("amount") || 0),
      discount: discountRaw ? Number(discountRaw) : undefined,
      dueDate: String(fd.get("dueDate") || "") || undefined,
      description: String(fd.get("description") || "") || undefined,
    };

    const res = fee
      ? await updateFee({ id: fee.id, ...payload })
      : await createFee({
          studentId: String(fd.get("studentId") || ""),
          courseId: String(fd.get("courseId") || ""),
          ...payload,
        });

    setPending(false);
    if (res.ok) {
      router.push(`/admin/fees/${res.feeId}`);
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Fee details</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {fee ? (
            <>
              <div className="space-y-2">
                <Label>Student</Label>
                <p className="text-sm font-medium">{fee.studentName}</p>
              </div>
              <div className="space-y-2">
                <Label>Course</Label>
                <p className="text-sm font-medium">{fee.courseName}</p>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="studentId">Student *</Label>
                <select
                  id="studentId" name="studentId" required
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Select student</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>{s.fullName} ({s.studentId})</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="courseId">Course *</Label>
                <select
                  id="courseId" name="courseId" required onChange={onCourseChange}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Select course</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="amount">Amount due *</Label>
            <Input
              ref={amountRef}
              id="amount" name="amount" type="number" min="0.01" step="0.01" required
              defaultValue={fee?.amount}
              placeholder="Auto-fills from course default fee"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="discount">Discount</Label>
            <Input id="discount" name="discount" type="number" min="0" step="0.01" defaultValue={fee?.discount || ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dueDate">Due date</Label>
            <Input id="dueDate" name="dueDate" type="date" defaultValue={fee?.dueDate ?? ""} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="description">Description</Label>
            <Input id="description" name="description" maxLength={500} defaultValue={fee?.description ?? ""} />
          </div>
        </CardContent>
      </Card>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : fee ? "Save changes" : "Create fee"}
        </Button>
        <Button type="button" variant="outline" asChild>
          <Link href={fee ? `/admin/fees/${fee.id}` : "/admin/fees"}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
