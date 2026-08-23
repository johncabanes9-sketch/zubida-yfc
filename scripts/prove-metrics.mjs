// Proves the dashboard's arithmetic. No database required — every assertion is
// about the pure functions the admin dashboard derives its charts from:
//
//   1. Day bucketing is local-time, not UTC, and keeps empty days.
//   2. The status segment order keeps green and red apart (a CVD requirement).
//   3. Share and remaining-slot maths survive their degenerate inputs.
//
// The charts are only as honest as these functions. Run: npm run prove:metrics
const {
  bucketByDay,
  localDayKey,
  share,
  slotsLeft,
  STATUS_ORDER,
  STATUS_VAR,
} = await import("../src/lib/admin/metrics.ts");

let pass = 0,
  fail = 0;
const check = (n, c, got) =>
  c
    ? (pass++, console.log(`  PASS  ${n}`))
    : (fail++, console.log(`  FAIL  ${n}  got=${JSON.stringify(got)}`));

// ── 1. Day bucketing ───────────────────────────────────────────────────────
// The series drives a 30-bar chart. A missing day would silently compress a
// quiet fortnight into a chart that looks busier than the month really was.
const now = new Date(2026, 7, 23, 12, 0, 0); // 23 Aug 2026, local noon
const seven = bucketByDay([], 7, now);

check("a 7-day window returns exactly 7 buckets", seven.length === 7, seven.length);
check(
  "buckets run oldest first and end on today",
  seven[0].day === "2026-08-17" && seven[6].day === "2026-08-23",
  [seven[0]?.day, seven[6]?.day],
);
check(
  "a day with no registrations is present with a zero count",
  seven.every((b) => b.count === 0),
  seven,
);

// The timezone trap this function exists to avoid. Which local hour crosses the
// UTC date line depends on which side of UTC the runner sits: east of UTC (as
// Zamboanga is, at UTC+8) it is the small hours that roll *back* a day in UTC;
// west of UTC it is the late evening that rolls forward. Pick the hour that
// actually diverges here, so the assertion proves something wherever it runs.
const offsetMinutes = new Date(2026, 7, 23).getTimezoneOffset(); // <0 east of UTC
const crossing =
  offsetMinutes < 0
    ? new Date(2026, 7, 23, 0, 30, 0) // east of UTC: early morning
    : new Date(2026, 7, 23, 23, 30, 0); // UTC or west: late evening

check(
  "a boundary-crossing local timestamp keys to its local day",
  localDayKey(crossing) === "2026-08-23",
  localDayKey(crossing),
);
check(
  "localDayKey disagrees with a naive UTC slice wherever the two can differ",
  // Guards the assertion above: on a machine running exactly UTC the two agree
  // by definition, and there is nothing for this check to catch.
  offsetMinutes === 0 || localDayKey(crossing) !== crossing.toISOString().slice(0, 10),
  {
    offsetMinutes,
    local: localDayKey(crossing),
    utc: crossing.toISOString().slice(0, 10),
  },
);

const counted = bucketByDay(
  [
    new Date(2026, 7, 23, 9, 0).toISOString(),
    new Date(2026, 7, 23, 10, 0).toISOString(),
    new Date(2026, 7, 21, 8, 0).toISOString(),
  ],
  7,
  now,
);
check(
  "two registrations on the same day land in one bucket",
  counted.find((b) => b.day === "2026-08-23")?.count === 2,
  counted.find((b) => b.day === "2026-08-23"),
);
check(
  "a registration two days back lands in its own bucket",
  counted.find((b) => b.day === "2026-08-21")?.count === 1,
  counted.find((b) => b.day === "2026-08-21"),
);
check(
  "a timestamp older than the window is dropped, not folded into day one",
  bucketByDay([new Date(2026, 6, 1).toISOString()], 7, now).every((b) => b.count === 0),
  bucketByDay([new Date(2026, 6, 1).toISOString()], 7, now),
);

// ── 2. Segment order is a colour-vision requirement ────────────────────────
// Amber must sit between green and red. Green beside red is the worst adjacent
// pair for deuteranopia; measured, reordering drops separation from dE 10.6 to 5.2.
const gi = STATUS_ORDER.indexOf("approved");
const wi = STATUS_ORDER.indexOf("pending");
const ri = STATUS_ORDER.indexOf("rejected");
check(
  "pending sits between approved and rejected in the segment order",
  (gi < wi && wi < ri) || (ri < wi && wi < gi),
  [...STATUS_ORDER],
);
check(
  "every status has a chart colour",
  STATUS_ORDER.every((s) => typeof STATUS_VAR[s] === "string" && STATUS_VAR[s].startsWith("var(")),
  STATUS_VAR,
);

// ── 3. Degenerate inputs ───────────────────────────────────────────────────
check("share of an empty table is 0, not NaN", share(0, 0) === 0, share(0, 0));
check("share is a percentage, not a fraction", share(1, 4) === 25, share(1, 4));
check(
  "slotsLeft floors at zero when capacity was lowered below what is taken",
  slotsLeft(10, 14) === 0,
  slotsLeft(10, 14),
);
check("slotsLeft subtracts normally", slotsLeft(50, 12) === 38, slotsLeft(50, 12));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
