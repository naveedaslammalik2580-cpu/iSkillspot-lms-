"use client";

import { useState } from "react";
import { updateNotificationPreference } from "@/lib/actions/notifications";
import type { PreferenceRow } from "@/lib/data/notifications";
import { Card } from "@/components/ui/card";

const TYPE_LABELS: Record<string, string> = {
  LESSON: "Lessons",
  ASSIGNMENT: "Assignments",
  QUIZ: "Quizzes",
  ATTENDANCE: "Attendance",
  ANNOUNCEMENT: "Announcements",
  CERTIFICATE: "Certificates",
  FEE: "Fees & payments",
  SYSTEM: "Account & system",
};

export function NotificationPreferences({ initial, pushConfigured }: { initial: PreferenceRow[]; pushConfigured: boolean }) {
  const [rows, setRows] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  async function toggle(type: PreferenceRow["type"], channel: "inApp" | "push", enabled: boolean) {
    const key = `${type}:${channel}`;
    setSaving(key);
    setError(null);
    setRows((rs) => rs.map((r) => (r.type === type ? { ...r, [channel]: enabled } : r)));
    const res = await updateNotificationPreference({ type, channel, enabled });
    if (!res.ok) {
      setError(res.error);
      setRows((rs) => rs.map((r) => (r.type === type ? { ...r, [channel]: !enabled } : r)));
    }
    setSaving(null);
  }

  return (
    <Card className="mt-8 p-5">
      <h2 className="text-base font-semibold">Notification preferences</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Choose what you hear about. Changes apply to future notifications; your history stays as it is. Account &amp; system
        notifications always stay on in the app.
      </p>
      {error && <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-2 pr-4 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">In-app</th>
              <th className="px-4 py-2 font-medium">Browser push</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const essential = r.type === "SYSTEM";
              return (
                <tr key={r.type} className="border-b border-border/60 last:border-0">
                  <td className="py-2.5 pr-4 font-medium">{TYPE_LABELS[r.type] ?? r.type}</td>
                  <td className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={essential ? true : r.inApp}
                      disabled={essential || saving === `${r.type}:inApp`}
                      onChange={(e) => toggle(r.type, "inApp", e.target.checked)}
                      aria-label={`${TYPE_LABELS[r.type] ?? r.type} in-app notifications`}
                    />
                    {essential && <span className="ml-2 text-xs text-muted-foreground">Always on</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={r.push}
                      disabled={!pushConfigured || saving === `${r.type}:push`}
                      onChange={(e) => toggle(r.type, "push", e.target.checked)}
                      aria-label={`${TYPE_LABELS[r.type] ?? r.type} push notifications`}
                    />
                    {!pushConfigured && <span className="ml-2 text-xs text-muted-foreground">Not set up yet</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
