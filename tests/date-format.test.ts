/**
 * Date formatting tests — node:test via tsx (pure, no database).
 *
 * Mission 2 (Phase 4) consolidated the ~6 inline date-formatting sites
 * onto the shared helpers in src/lib/utils.ts: formatDate gained an
 * optional { timeZone } (used by the server-rendered admin pages that
 * pin rendering to Asia/Karachi) and formatDateTime was added with the
 * exact options the support thread previously implemented locally.
 *
 * These tests pin: the shared en-GB convention, date-only values,
 * timestamps, the null/invalid contract, and timezone-sensitive
 * rendering (an instant near midnight UTC falls on different calendar
 * days in UTC vs Asia/Karachi — the pinned zone must win).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatDate, formatDateTime } from "@/lib/utils";

describe("formatDate", () => {
  it("formats a timestamp in the shared convention (en-GB, short month)", () => {
    assert.equal(formatDate("2026-11-19T12:00:00.000Z", { timeZone: "UTC" }), "19 Nov 2026");
    assert.equal(formatDate(new Date("2026-01-05T12:00:00.000Z"), { timeZone: "UTC" }), "05 Jan 2026");
  });

  it("formats a date-only value", () => {
    // Date-only ISO strings parse as UTC midnight; pinning the zone makes
    // the rendered calendar day deterministic.
    assert.equal(formatDate("2026-01-05", { timeZone: "UTC" }), "05 Jan 2026");
  });

  it("returns the em-dash placeholder for missing values", () => {
    assert.equal(formatDate(null), "—");
    assert.equal(formatDate(undefined), "—");
    assert.equal(formatDate(""), "—");
  });

  it("honours the pinned time zone for a near-midnight instant", () => {
    // 20:30 UTC = 01:30 the NEXT day in Asia/Karachi (UTC+5).
    const instant = "2026-11-19T20:30:00.000Z";
    assert.equal(formatDate(instant, { timeZone: "UTC" }), "19 Nov 2026");
    assert.equal(formatDate(instant, { timeZone: "Asia/Karachi" }), "20 Nov 2026");
  });
});

describe("formatDateTime", () => {
  it("formats a timestamp with hours and minutes", () => {
    assert.equal(
      formatDateTime("2026-11-19T14:30:00.000Z", { timeZone: "UTC" }),
      "19 Nov 2026, 14:30",
    );
  });

  it("accepts Date objects and ISO strings identically", () => {
    const iso = "2026-03-02T09:05:00.000Z";
    assert.equal(
      formatDateTime(new Date(iso), { timeZone: "UTC" }),
      formatDateTime(iso, { timeZone: "UTC" }),
    );
  });

  it("returns the em-dash placeholder for missing values", () => {
    assert.equal(formatDateTime(null), "—");
    assert.equal(formatDateTime(undefined), "—");
  });

  it("shifts the clock (and day) with the pinned time zone", () => {
    // 20:30 UTC = 01:30 Asia/Karachi the next day.
    const instant = "2026-11-19T20:30:00.000Z";
    assert.equal(formatDateTime(instant, { timeZone: "UTC" }), "19 Nov 2026, 20:30");
    assert.equal(formatDateTime(instant, { timeZone: "Asia/Karachi" }), "20 Nov 2026, 01:30");
  });
});
