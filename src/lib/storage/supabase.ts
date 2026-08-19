import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

/**
 * Supabase Storage adapter for assignment submission files (private bucket,
 * signed URLs only). Uses the service role key — server-side only, mirrors
 * the SESSION_SECRET presence/validity check in session.ts. Validation is
 * lazy (inside the factory, on first use) so a missing env var never breaks
 * the build — only the request that actually needs storage.
 */

let client: SupabaseClient | null = null;
let bucket: string | null = null;

function getClient(): { client: SupabaseClient; bucket: string } {
  if (client && bucket) return { client, bucket };

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucketName = process.env.SUPABASE_STORAGE_BUCKET;

  if (!url || !serviceRoleKey || !bucketName) {
    throw new Error(
      "SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_STORAGE_BUCKET must all be set."
    );
  }

  client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  bucket = bucketName;
  return { client, bucket };
}

/** Strip path separators/control chars, cap length — safe to embed in a storage key. */
function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(/[/\\]/g, "_")
    .replace(/[\x00-\x1f\x7f]/g, "")
    .trim();
  return (cleaned || "file").slice(0, 200);
}

export async function uploadSubmissionFile({
  submissionId,
  file,
  originalName,
}: {
  submissionId: string;
  file: File;
  originalName: string;
}): Promise<{ storageKey: string; sizeBytes: number; mimeType: string }> {
  const { client, bucket } = getClient();

  const storageKey = `submissions/${submissionId}/${randomUUID()}-${sanitizeFileName(originalName)}`;

  const { error } = await client.storage.from(bucket).upload(storageKey, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw new Error(`Upload failed: ${error.message}`);

  return {
    storageKey,
    sizeBytes: file.size,
    mimeType: file.type || "application/octet-stream",
  };
}

export async function getSignedDownloadUrl(
  storageKey: string,
  { expiresInSeconds = 300 }: { expiresInSeconds?: number } = {}
): Promise<string> {
  const { client, bucket } = getClient();
  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUrl(storageKey, expiresInSeconds);
  if (error || !data) throw new Error(`Could not sign download URL: ${error?.message ?? "unknown error"}`);
  return data.signedUrl;
}

export async function deleteSubmissionFile(storageKey: string): Promise<void> {
  const { client, bucket } = getClient();
  const { error } = await client.storage.from(bucket).remove([storageKey]);
  // "Not found" isn't fatal — the file may already be gone.
  if (error && !/not.?found/i.test(error.message)) {
    throw new Error(`Delete failed: ${error.message}`);
  }
}
