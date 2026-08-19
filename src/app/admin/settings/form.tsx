"use client";
import { useState } from "react";
import { saveSettingsAction } from "@/lib/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const FIELDS: { key: string; label: string }[] = [
  { key: "instituteName", label: "Institute name" },
  { key: "contactEmail", label: "Contact email" },
  { key: "contactPhone", label: "Contact phone" },
  { key: "address", label: "Address" },
  { key: "studentIdPrefix", label: "Student ID prefix" },
  { key: "currency", label: "Currency" },
  { key: "timezone", label: "Timezone" },
  { key: "attendanceThreshold", label: "Attendance threshold (%)" },
  { key: "passingScore", label: "Passing score (%)" },
  { key: "certMinProgress", label: "Certificate: min progress (%)" },
  { key: "certMinAttendance", label: "Certificate: min attendance (%)" },
  { key: "certMinScore", label: "Certificate: min score (%)" },
];

export function SettingsForm({ settings }: { settings: Record<string, string> }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const res = await saveSettingsAction(new FormData(e.currentTarget));
    setBusy(false);
    setMsg(res.ok ? "Saved." : res.error ?? "Error");
  }

  return (
    <form onSubmit={onSubmit}>
      <Card>
        <CardHeader><CardTitle>General</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <div key={f.key} className="space-y-2">
              <Label htmlFor={f.key}>{f.label}</Label>
              <Input id={f.key} name={f.key} defaultValue={settings[f.key] ?? ""} />
            </div>
          ))}
        </CardContent>
      </Card>
      <div className="mt-4 flex items-center gap-3">
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save settings"}</Button>
        {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
      </div>
    </form>
  );
}
