/**
 * Assignment task-PDF attachment format tests (pure — no database).
 *
 * The format lives in Assignment.attachments as a JSON array with at
 * most one entry: an uploaded file (storage key) or an external URL.
 * See src/lib/assignment-attachment.ts.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseAssignmentAttachment,
  serializeAssignmentAttachment,
} from "@/lib/assignment-attachment";

describe("parseAssignmentAttachment", () => {
  it("parses an upload entry", () => {
    const raw = JSON.stringify([
      { kind: "upload", key: "assignment-tasks/a1/uuid-task.pdf", name: "task.pdf" },
    ]);
    assert.deepEqual(parseAssignmentAttachment(raw), {
      kind: "upload",
      key: "assignment-tasks/a1/uuid-task.pdf",
      name: "task.pdf",
    });
  });

  it("parses a url entry and derives a display name when missing", () => {
    const named = parseAssignmentAttachment(
      JSON.stringify([{ kind: "url", url: "https://example.com/files/brief.pdf", name: "Brief" }])
    );
    assert.deepEqual(named, { kind: "url", url: "https://example.com/files/brief.pdf", name: "Brief" });

    const derived = parseAssignmentAttachment(
      JSON.stringify([{ kind: "url", url: "https://example.com/files/brief.pdf" }])
    );
    assert.deepEqual(derived, {
      kind: "url",
      url: "https://example.com/files/brief.pdf",
      name: "brief.pdf",
    });
  });

  it("returns null for empty / missing values", () => {
    assert.equal(parseAssignmentAttachment(null), null);
    assert.equal(parseAssignmentAttachment(undefined), null);
    assert.equal(parseAssignmentAttachment(""), null);
    assert.equal(parseAssignmentAttachment("[]"), null);
  });

  it("returns null for invalid JSON and non-array JSON", () => {
    assert.equal(parseAssignmentAttachment("not json"), null);
    assert.equal(parseAssignmentAttachment(JSON.stringify({ kind: "url", url: "https://x.co/a.pdf" })), null);
    assert.equal(parseAssignmentAttachment(JSON.stringify("upload")), null);
    assert.equal(parseAssignmentAttachment(JSON.stringify(42)), null);
  });

  it("rejects malformed entries", () => {
    // upload without a key
    assert.equal(parseAssignmentAttachment(JSON.stringify([{ kind: "upload", name: "x.pdf" }])), null);
    assert.equal(parseAssignmentAttachment(JSON.stringify([{ kind: "upload", key: "  " }])), null);
    // url that is not http(s)
    assert.equal(parseAssignmentAttachment(JSON.stringify([{ kind: "url", url: "javascript:alert(1)" }])), null);
    assert.equal(parseAssignmentAttachment(JSON.stringify([{ kind: "url", url: "ftp://x.co/a.pdf" }])), null);
    assert.equal(parseAssignmentAttachment(JSON.stringify([{ kind: "url", url: "not a url" }])), null);
    // unknown kind / non-object entries
    assert.equal(parseAssignmentAttachment(JSON.stringify([{ kind: "other", key: "k" }])), null);
    assert.equal(parseAssignmentAttachment(JSON.stringify(["assignment-tasks/a/b.pdf"])), null);
    assert.equal(parseAssignmentAttachment(JSON.stringify([null])), null);
  });

  it("skips invalid entries and uses the first valid one", () => {
    const raw = JSON.stringify([
      { kind: "url", url: "javascript:alert(1)" },
      { kind: "url", url: "https://example.com/ok.pdf", name: "OK" },
      { kind: "upload", key: "assignment-tasks/a/b.pdf", name: "B" },
    ]);
    assert.deepEqual(parseAssignmentAttachment(raw), {
      kind: "url",
      url: "https://example.com/ok.pdf",
      name: "OK",
    });
  });

  it("falls back to the storage key's file name for uploads without a name", () => {
    const parsed = parseAssignmentAttachment(
      JSON.stringify([{ kind: "upload", key: "assignment-tasks/a1/uuid-my-task.pdf" }])
    );
    assert.deepEqual(parsed, {
      kind: "upload",
      key: "assignment-tasks/a1/uuid-my-task.pdf",
      name: "uuid-my-task.pdf",
    });
  });
});

describe("serializeAssignmentAttachment", () => {
  it("round-trips both kinds", () => {
    const upload = { kind: "upload", key: "assignment-tasks/a/b.pdf", name: "b.pdf" } as const;
    assert.deepEqual(parseAssignmentAttachment(serializeAssignmentAttachment(upload)), upload);

    const url = { kind: "url", url: "https://example.com/t.pdf", name: "t.pdf" } as const;
    assert.deepEqual(parseAssignmentAttachment(serializeAssignmentAttachment(url)), url);
  });

  it("serializes to a one-element JSON array", () => {
    const raw = serializeAssignmentAttachment({ kind: "url", url: "https://e.co/x.pdf", name: "x.pdf" });
    const arr = JSON.parse(raw);
    assert.ok(Array.isArray(arr));
    assert.equal(arr.length, 1);
  });
});
