// Verifies the remaining engine behaviors against the hosted DB:
// duplicate, deadline-passed, closed, full, and rate-limit.
import pg from "pg";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const pool = new pg.Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
  max: 8,
});
const q = (sql, params) => pool.query(sql, params);
const reg = (payload) => q(`select register_for_event($1::jsonb) as r`, [JSON.stringify(payload)]).then((r) => r.rows[0].r);

let passed = 0, failed = 0;
function check(name, cond, got) {
  if (cond) { console.log(`  PASS  ${name}`); passed++; }
  else { console.log(`  FAIL  ${name}  (got: ${JSON.stringify(got)})`); failed++; }
}

async function mkEvent({ slots = 10, status = "Open", days = 7 }) {
  const { rows } = await q(
    `insert into events (name, date, registration_deadline, slots_total, slots_taken, status, scope)
     values ('BEHAVIOR TEST', '2026-12-01', now() + ($1 || ' days')::interval, $2, 0, $3, 'Provincial')
     returning id`,
    [String(days), slots, status],
  );
  return rows[0].id;
}
async function cleanup(id) {
  await q(`delete from event_registrations where event_id = $1`, [id]);
  await q(`delete from events where id = $1`, [id]);
}

(async () => {
  // 1. duplicate (case-insensitive), concurrent
  let id = await mkEvent({ slots: 10 });
  const [a, b] = await Promise.all([
    reg({ event_id: id, full_name: "A", email: "Same@Example.com", chapter: "X", age: 18, consent: true }),
    reg({ event_id: id, full_name: "B", email: "same@example.com", chapter: "X", age: 18, consent: true }),
  ]);
  const oks = [a, b].filter((r) => r.ok).length;
  const dups = [a, b].filter((r) => r.code === "DUPLICATE").length;
  const { rows: t } = await q(`select slots_taken from events where id=$1`, [id]);
  check("duplicate: exactly one succeeds", oks === 1 && dups === 1, { oks, dups });
  check("duplicate: slot released (slots_taken=1)", t[0].slots_taken === 1, t[0].slots_taken);
  await cleanup(id);

  // 2. deadline passed
  id = await mkEvent({ days: -1 });
  check("deadline passed -> DEADLINE_PASSED", (await reg({ event_id: id, full_name: "C", email: "c@x.com", chapter: "X", age: 18, consent: true })).code === "DEADLINE_PASSED");
  await cleanup(id);

  // 3. closed
  id = await mkEvent({ status: "Closed" });
  check("closed event -> CLOSED", (await reg({ event_id: id, full_name: "D", email: "d@x.com", chapter: "X", age: 18, consent: true })).code === "CLOSED");
  await cleanup(id);

  // 4. full
  id = await mkEvent({ slots: 1 });
  await reg({ event_id: id, full_name: "E", email: "e@x.com", chapter: "X", age: 18, consent: true });
  check("full event -> FULL", (await reg({ event_id: id, full_name: "F", email: "f@x.com", chapter: "X", age: 18, consent: true })).code === "FULL");
  await cleanup(id);

  // 5. rejecting a registration returns its seat to the pool (ADR-5).
  // Before 0020 the seat was held forever: the public "N left" figure overstated
  // how full the event was, and register_for_event refused genuine applicants
  // with FULL while seats were actually free.
  id = await mkEvent({ slots: 1 });
  const first = await reg({ event_id: id, full_name: "G", email: "g@x.com", chapter: "X", age: 18, consent: true });
  check("reject: event is full before rejection", (await reg({ event_id: id, full_name: "H", email: "h@x.com", chapter: "X", age: 18, consent: true })).code === "FULL");

  await q(`update event_registrations set status = 'rejected' where registration_id = $1`, [first.registration_id]);
  const { rows: afterReject } = await q(`select slots_taken from events where id = $1`, [id]);
  check("reject: slot released (slots_taken=0)", afterReject[0].slots_taken === 0, afterReject[0].slots_taken);
  check("reject: a real applicant can now register", (await reg({ event_id: id, full_name: "I", email: "i@x.com", chapter: "X", age: 18, consent: true })).ok === true);

  // Re-claiming a seat into a full event must fail loudly rather than overbook.
  let restoreErr = null;
  try {
    await q(`update event_registrations set status = 'approved' where registration_id = $1`, [first.registration_id]);
  } catch (e) { restoreErr = e.message; }
  check("reject: un-rejecting into a full event is refused", /slots are already taken/.test(restoreErr ?? ""), restoreErr);

  // Soft-deleting a registration releases its seat too.
  const { rows: live } = await q(`select registration_id from event_registrations where event_id = $1 and status = 'pending' limit 1`, [id]);
  await q(`update event_registrations set deleted_at = now() where registration_id = $1`, [live[0].registration_id]);
  const { rows: afterSoftDelete } = await q(`select slots_taken from events where id = $1`, [id]);
  check("soft-delete: slot released", afterSoftDelete[0].slots_taken === 0, afterSoftDelete[0].slots_taken);
  await cleanup(id);

  // 6. rate limit: 5 allowed then blocked
  const ip = "203.0.113." + Math.floor(Math.random() * 250);
  const rl = [];
  for (let i = 0; i < 7; i++) rl.push(q(`select check_rate_limit($1,'register',60,5) as ok`, [ip]));
  const allowed = (await Promise.all(rl)).filter((r) => r.rows[0].ok === true).length;
  check("rate limit: exactly 5 allowed in window", allowed === 5, allowed);
  await q(`delete from rate_limits where ip=$1`, [ip]);

  // 7. The standing invariant, across every row in the table: slots_taken equals
  // the number of registrations actually holding a seat. Checked for ALL events,
  // soft-deleted included — a retired event can be restored, and it would bring a
  // stale counter back into public view with it.
  const { rows: drift } = await q(`
    select ev.name, ev.slots_taken,
           count(r.id) filter (
             where r.deleted_at is null and r.status in ('pending','approved')
           )::int as holding
      from events ev
      left join event_registrations r on r.event_id = ev.id
     group by ev.id, ev.name, ev.slots_taken
    having ev.slots_taken is distinct from count(r.id) filter (
             where r.deleted_at is null and r.status in ('pending','approved')
           )::int
  `);
  check("invariant: slots_taken matches holding registrations on every event", drift.length === 0, drift);

  await pool.end();
  console.log("─".repeat(40));
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
