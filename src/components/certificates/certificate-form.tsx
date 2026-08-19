"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { issueCertificate } from "@/lib/actions/certificates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Copy } from "lucide-react";

type StudentOption = { id: string; studentId: string; fullName: string; courses: { id: string; title: string }[] };

export function CertificateForm({ students }: { students: StudentOption[] }) {
  const router = useRouter();
  const [studentId, setStudentId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ certificateId: string; verificationCode: string } | null>(null);

  const courses = students.find((s) => s.id === studentId)?.courses ?? [];

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await issueCertificate({
      studentId,
      courseId: String(fd.get("courseId") || ""),
      notes: String(fd.get("notes") || "") || undefined,
    });
    setPending(false);
    if (res.ok) {
      setIssued({ certificateId: res.certificateId, verificationCode: res.verificationCode });
    } else {
      setError(res.error);
    }
  }

  if (issued) {
    const verifyUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/verify/${issued.verificationCode}`;
    return (
      <Card className="max-w-lg">
        <CardHeader>
          <div className="flex items-center gap-2 text-green-700">
            <CheckCircle2 className="h-5 w-5" />
            <CardTitle>Certificate issued</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 rounded-md border border-border bg-muted/40 p-4 font-mono text-xs">
            <div>Verification URL: <strong>{verifyUrl}</strong></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => navigator.clipboard.writeText(verifyUrl)}>
              <Copy className="h-4 w-4" /> Copy link
            </Button>
            <Button asChild>
              <Link href={`/admin/certificates/${issued.certificateId}`}>Open certificate</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Issue certificate</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="studentId">Student *</Label>
            <select
              id="studentId" required value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
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
              id="courseId" name="courseId" required disabled={!studentId}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">{studentId ? "Select course" : "Select a student first"}</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
            {studentId && courses.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No eligible courses — either not enrolled anywhere, or already certified for every course.
              </p>
            )}
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" name="notes" maxLength={1000} />
          </div>
        </CardContent>
      </Card>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending || !studentId}>
          {pending ? "Issuing…" : "Issue certificate"}
        </Button>
        <Button type="button" variant="outline" asChild>
          <Link href="/admin/certificates">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
