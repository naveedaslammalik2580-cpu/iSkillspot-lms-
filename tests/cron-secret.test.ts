/**
 * Cron secret policy tests — node:test via tsx.
 *
 * Mission 2 (Phase 3) aligned the reminders cron route with the policy
 * the emails cron route already enforced and .env.example already
 * documented: a CRON_SECRET shorter than 32 characters is not a valid
 * configuration. Before the change, /api/cron/reminders accepted ANY
 * non-empty secret while /api/cron/emails required >= 32 characters.
 *
 * These tests pin the shared policy for both endpoints:
 * - reminders: unset or too-short secret -> 503 (endpoint not configured);
 *   valid-length secret + wrong header -> 401; + correct header -> 200.
 * - emails: too-short secret -> 401 even with a matching bearer token;
 *   valid-length secret + wrong bearer -> 401.
 *
 * Secret values are never printed. Disposable database only.
 */
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { POST as remindersPOST } from "@/app/api/cron/reminders/route";
import { GET as emailsGET } from "@/app/api/cron/emails/route";

const VALID = "test-cron-secret-with-at-least-32-chars";
const SHORT = "too-short";
const original = process.env.CRON_SECRET;

after(() => {
  if (original === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = original;
});

function remindersRequest(secretHeader?: string) {
  return new Request("http://localhost/api/cron/reminders", {
    method: "POST",
    headers: secretHeader ? { "x-cron-secret": secretHeader } : {},
  });
}

function emailsRequest(bearer?: string) {
  return new Request("http://localhost/api/cron/emails", {
    headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
  });
}

describe("cron secret minimum length (shared policy: >= 32 chars)", () => {
  it("reminders: unset CRON_SECRET -> 503", async () => {
    delete process.env.CRON_SECRET;
    const res = await remindersPOST(remindersRequest(VALID));
    assert.equal(res.status, 503);
  });

  it("reminders: too-short CRON_SECRET -> 503 (new: previously accepted)", async () => {
    process.env.CRON_SECRET = SHORT;
    const res = await remindersPOST(remindersRequest(SHORT));
    assert.equal(res.status, 503);
  });

  it("reminders: valid-length secret + wrong header -> 401", async () => {
    process.env.CRON_SECRET = VALID;
    const res = await remindersPOST(remindersRequest("wrong-secret-wrong-secret-wrong-32x"));
    assert.equal(res.status, 401);
  });

  it("reminders: valid-length secret + correct header -> 200", async () => {
    process.env.CRON_SECRET = VALID;
    const res = await remindersPOST(remindersRequest(VALID));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
  });

  it("emails: too-short CRON_SECRET -> 401 even with matching bearer", async () => {
    process.env.CRON_SECRET = SHORT;
    const res = await emailsGET(emailsRequest(SHORT));
    assert.equal(res.status, 401);
  });

  it("emails: valid-length secret + wrong bearer -> 401", async () => {
    process.env.CRON_SECRET = VALID;
    const res = await emailsGET(emailsRequest("wrong-secret-wrong-secret-wrong-32x"));
    assert.equal(res.status, 401);
  });
});
