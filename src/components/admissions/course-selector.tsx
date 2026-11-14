"use client";
import { useState } from "react";
import { ActionForm } from "./forms";
import { selectCourseAction } from "@/lib/actions/admissions";
import { Label } from "@/components/ui/label";
export function CourseSelector({
  id,
  courses,
  currency,
}: {
  id: string;
  currency: string;
  courses: {
    id: string;
    title: string;
    defaultFee: number | null;
    admissionPayment: number | null;
    batches: { id: string; name: string; schedule: string | null }[];
  }[];
}) {
  const [selected, setSelected] = useState("");
  const course = courses.find((c) => c.id === selected);
  return (
    <ActionForm
      action={selectCourseAction}
      label="Continue to payment instructions"
    >
      <input type="hidden" name="id" value={id} />
      <div className="space-y-2">
        <Label htmlFor="courseId">Choose your course</Label>
        <select
          id="courseId"
          name="courseId"
          required
          className="h-11 w-full rounded-md border bg-background px-3"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">Select a course</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </div>
      {course && (
        <>
          <p className="text-sm">
            Total fee:{" "}
            <strong>
              {currency} {course.defaultFee?.toLocaleString()}
            </strong>
            <br />
            Required admission payment:{" "}
            <strong>
              {currency} {course.admissionPayment?.toLocaleString()}
            </strong>
          </p>
          <div className="space-y-2">
            <Label htmlFor="batchId">Preferred batch (optional)</Label>
            <select
              key={selected}
              id="batchId"
              name="batchId"
              className="h-11 w-full rounded-md border bg-background px-3"
            >
              <option value="">Let the institute assign my batch</option>
              {course.batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {b.schedule ? ` · ${b.schedule}` : ""}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-muted-foreground">
            The institute confirms your final batch during approval.
          </p>
        </>
      )}
      {!courses.length && <p>No courses are accepting admissions right now.</p>}
    </ActionForm>
  );
}
