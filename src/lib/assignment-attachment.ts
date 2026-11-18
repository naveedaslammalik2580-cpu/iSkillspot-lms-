/**
 * Assignment "practical task" PDF attachment.
 *
 * Stored in the existing `Assignment.attachments` column (previously
 * unused). FORMAT: a JSON array holding AT MOST ONE task file:
 *
 *   [{ "kind": "upload", "key": "<storageKey>", "name": "<originalName>" }]
 *   [{ "kind": "url",    "url": "https://…",    "name": "<displayName>" }]
 *
 * - "upload": the PDF lives in the private storage bucket under `key`
 *   and is only ever served through the signed-URL route
 *   (/api/assignments/task-file) — the raw key is never a public URL.
 * - "url": the admin pasted a link to a PDF hosted elsewhere; it is
 *   linked directly and needs no storage configuration.
 *
 * Parsing is defensive: empty/invalid JSON, non-array JSON, or entries
 * that fail validation all degrade to "no attachment" (null).
 */

export type AssignmentAttachment =
  | { kind: "upload"; key: string; name: string }
  | { kind: "url"; url: string; name: string };

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Best-effort display name for a URL attachment (last path segment). */
export function attachmentNameFromUrl(url: string): string {
  try {
    const last = new URL(url).pathname.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last) : "Task file (PDF)";
  } catch {
    return "Task file (PDF)";
  }
}

function asAttachment(entry: unknown): AssignmentAttachment | null {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const e = entry as Record<string, unknown>;

  if (e.kind === "upload") {
    if (typeof e.key !== "string" || e.key.trim() === "") return null;
    const name =
      typeof e.name === "string" && e.name.trim() !== ""
        ? e.name
        : e.key.split("/").pop() ?? "Task file (PDF)";
    return { kind: "upload", key: e.key, name };
  }

  if (e.kind === "url") {
    if (typeof e.url !== "string" || !isHttpUrl(e.url)) return null;
    const name =
      typeof e.name === "string" && e.name.trim() !== "" ? e.name : attachmentNameFromUrl(e.url);
    return { kind: "url", url: e.url, name };
  }

  return null;
}

/** Parse the stored attachments column. Returns the single task
 *  attachment, or null when there is none / the value is unusable. */
export function parseAssignmentAttachment(
  raw: string | null | undefined
): AssignmentAttachment | null {
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    for (const entry of arr) {
      const attachment = asAttachment(entry);
      if (attachment) return attachment;
    }
    return null;
  } catch {
    return null;
  }
}

/** Serialize one task attachment into the stored format. */
export function serializeAssignmentAttachment(attachment: AssignmentAttachment): string {
  return JSON.stringify([attachment]);
}
