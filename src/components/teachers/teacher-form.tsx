"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createTeacher, updateTeacher } from "@/lib/actions/teachers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Copy } from "lucide-react";

export function TeacherForm({
  teacher,
}: {
  teacher?: {
    id: string;
    fullName: string;
    phone: string | null;
    specialization: string | null;
  };
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ teacherId: string; username: string; tempPassword: string } | null>(
    null
  );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const fullName = String(fd.get("fullName") || "");
    const phone = String(fd.get("phone") || "") || undefined;
    const specialization = String(fd.get("specialization") || "") || undefined;

    if (teacher) {
      const res = await updateTeacher({ id: teacher.id, fullName, phone, specialization });
      setPending(false);
      if (res.ok) {
        router.push(`/admin/teachers/${teacher.id}`);
        router.refresh();
      } else {
        setError(res.error);
      }
      return;
    }

    const username = String(fd.get("username") || "");
    const email = String(fd.get("email") || "");
    const res = await createTeacher({ fullName, email, username, phone, specialization });
    setPending(false);
    if (res.ok) {
      setCreated({ teacherId: res.teacherId, username, tempPassword: res.tempPassword });
    } else {
      setError(res.error);
    }
  }

  if (created) {
    const text = `iSkillSpot teacher login\nUsername: ${created.username}\nTemporary password: ${created.tempPassword}`;
    return (
      <Card className="max-w-lg">
        <CardHeader>
          <div className="flex items-center gap-2 text-green-700">
            <CheckCircle2 className="h-5 w-5" />
            <CardTitle>Teacher created successfully</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Share these credentials securely. The teacher must change the password at first login.
          </p>
          <div className="space-y-2 rounded-md border border-border bg-muted/40 p-4 font-mono text-sm">
            <div>Username: <strong>{created.username}</strong></div>
            <div>Temp password: <strong>{created.tempPassword}</strong></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => navigator.clipboard.writeText(text)}>
              <Copy className="h-4 w-4" /> Copy credentials
            </Button>
            <Button asChild>
              <Link href={`/admin/teachers/${created.teacherId}`}>Open profile</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Teacher details</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="fullName">Full name *</Label>
            <Input id="fullName" name="fullName" required maxLength={200} defaultValue={teacher?.fullName} />
          </div>

          {!teacher && (
            <>
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input id="email" name="email" type="email" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="username">Username *</Label>
                <Input id="username" name="username" required minLength={3} maxLength={50} />
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" name="phone" defaultValue={teacher?.phone ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="specialization">Specialization</Label>
            <Input
              id="specialization"
              name="specialization"
              maxLength={500}
              defaultValue={teacher?.specialization ?? ""}
            />
          </div>
        </CardContent>
      </Card>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : teacher ? "Save changes" : "Create teacher"}
        </Button>
        <Button type="button" variant="outline" asChild>
          <Link href={teacher ? `/admin/teachers/${teacher.id}` : "/admin/teachers"}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
