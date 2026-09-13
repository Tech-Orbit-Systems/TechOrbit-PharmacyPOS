const { test } = require("node:test");
const assert = require("node:assert/strict");
const { rangeFor, dayKey } = require("../desktop/ranges.cjs");
test("Pakistan civil date crosses UTC midnight correctly", () =>
  assert.equal(dayKey("2026-09-12T20:00:00Z"), "2026-09-13"));
test("six-month rolling window includes partial months and seven buckets", () => {
  const r = rangeFor({ range: "6m" }, new Date("2026-09-13T10:00:00Z"));
  assert.equal(r.from, "2026-03-14");
  assert.equal(r.to, "2026-09-13");
  assert.equal(r.keys.length, 7);
  assert.equal(r.start, "2026-03-13T19:00:00.000Z");
});
test("one-month end clamp handles February", () => {
  assert.equal(
    rangeFor({ range: "1m" }, new Date("2026-03-31T10:00:00Z")).from,
    "2026-03-01",
  );
});
test("seven days fills seven daily buckets", () =>
  assert.equal(
    rangeFor({ range: "7d" }, new Date("2026-09-13")).keys.length,
    7,
  ));
test("rejects reversed dates, impossible dates and unknown ranges", () => {
  for (const input of [
    { range: "x" },
    { range: "custom", from: "2026-02-30", to: "2026-03-01" },
    { range: "custom", from: "2026-03-02", to: "2026-03-01" },
  ])
    assert.throws(() => rangeFor(input, new Date("2026-09-13")));
});
