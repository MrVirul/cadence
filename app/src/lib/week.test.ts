import assert from "node:assert/strict";
import test from "node:test";
import {
  addWeeksUtc,
  currentWeekStartUtc,
  getWeekRangeLabel,
  getWeekWindowStatus,
  isMondayUtc,
  latestWeekStartUtc,
} from "./week";

test("currentWeekStartUtc uses UTC date even when UTC+5:30 is early Monday", () => {
  // 2026-10-12 01:30 IST is 2026-10-11 20:00 UTC (Sunday in UTC -> week of 2026-10-05)
  const earlyMondayIst = new Date("2026-10-12T01:30:00+05:30");
  assert.equal(currentWeekStartUtc(earlyMondayIst), "2026-10-05");

  // 2026-10-12 06:00 IST is 2026-10-12 00:30 UTC (Monday in UTC -> week of 2026-10-12)
  const mondayUtc = new Date("2026-10-12T06:00:00+05:30");
  assert.equal(currentWeekStartUtc(mondayUtc), "2026-10-12");
});

test("isMondayUtc, addWeeksUtc, latestWeekStartUtc and getWeekWindowStatus", () => {
  const ref = new Date("2026-10-13T01:30:00+05:30"); // 2026-10-12T20:00:00Z
  assert.equal(currentWeekStartUtc(ref), "2026-10-12");
  assert.equal(latestWeekStartUtc(ref), "2026-11-09");
  assert.equal(isMondayUtc("2026-10-12"), true);
  assert.equal(isMondayUtc("2026-10-13"), false);
  assert.equal(isMondayUtc("2026-02-30"), false);
  assert.equal(addWeeksUtc("2026-10-12", -1), "2026-10-05");
  assert.equal(addWeeksUtc("2026-10-12", 4), "2026-11-09");

  assert.equal(getWeekWindowStatus("2026-10-05", ref), "past");
  assert.equal(getWeekWindowStatus("2026-10-12", ref), "creatable");
  assert.equal(getWeekWindowStatus("2026-11-09", ref), "creatable");
  assert.equal(getWeekWindowStatus("2026-11-16", ref), "too_far_ahead");
  assert.equal(getWeekRangeLabel("2026-10-12"), "Oct 12 – 16, 2026");
});
