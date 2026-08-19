"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createStudentAction, type CreateStudentResult } from "@/lib/actions/students";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Copy, Printer } from "lucide-react";

type Course = { id: string; title: string; batches: { id: string; name: string }[] };

export function AddStudentForm({ courses }: { courses: Course[] }) {
  const router = useRouter();
  const [courseId, setCourseId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Extract<CreateStudentResult, { ok: true }> | null>(null);

  const batches = courses.find((c) => c.id === courseId)?.batches ?? [];

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await createStudentAction(fd);
    setPending(false);
    if (res.ok) setCreated(res);
    else setError(res.error);
  }

  if (created) {
    const text = `iSkillSpot login\nStudent ID: ${created.studentId}\nUsername: ${created.username}\nTemporary password: ${created.tempPassword}`;
    return (
      <Card className="max-w-lg">
        <CardHeader>
          <div className="flex items-center gap-2 text-green-700">
            <CheckCircle2 className="h-5 w-5" />
            <CardTitle>Student created successfully</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Share these credentials securely. The student must change the password at first login.
          </p>
          <div className="space-y-2 rounded-md border border-border bg-muted/40 p-4 font-mono text-sm">
            <div>Student ID: <strong>{created.studentId}</strong></div>
            <div>Username: <strong>{created.username}</strong></div>
            <div>Temp password: <strong>{created.tempPassword}</strong></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => navigator.clipboard.writeText(text)}>
              <Copy className="h-4 w-4" /> Copy credentials
            </Button>
            <Button type="button" variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print
            </Button>
            <Button asChild>
              <Link href={`/admin/students/${created.id}`}>Open profile</Link>
            </Button>
            <Button variant="ghost" onClick={() => { setCreated(null); router.refresh(); }}>
              Add another
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Personal information</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" name="fullName" required />
          <Field label="Father's name" name="fatherName" />
          <Field label="Email" name="email" type="email" required />
          <Field label="Phone" name="phone" />
          <Field label="WhatsApp" name="whatsapp" />
          <div className="space-y-2">
            <Label htmlFor="gender">Gender</Label>
            <select id="gender" name="gender" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">—</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <Field label="Date of birth" name="dateOfBirth" type="date" />
          <Field label="City" name="city" />
          <div className="sm:col-span-2">
            <Field label="Address" name="address" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Enrollment</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="courseId">Course *</Label>
            <select
              id="courseId" name="courseId" required value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Select course</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="batchId">Batch *</Label>
            <select
              id="batchId" name="batchId" required disabled={!courseId}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Select batch</option>
              {batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <Field label="Admission date" name="admissionDate" type="date" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Fee (optional)</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Total fee" name="totalFee" type="number" />
          <Field label="Discount" name="discount" type="number" />
        </CardContent>
      </Card>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create student"}</Button>
        <Button type="button" variant="outline" asChild><Link href="/admin/students">Cancel</Link></Button>
      </div>
    </form>
  );
}

function Field({ label, name, type = "text", required = false }: { label: string; name: string; type?: string; required?: boolean }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}{required && " *"}</Label>
      <Input id={name} name={name} type={type} required={required} />
    </div>
  );
}
