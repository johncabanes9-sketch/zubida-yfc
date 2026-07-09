// Proves the registration engine never overbooks, run directly against the
// hosted Postgres via a connection pool (no Docker, no supabase-js needed).
// Fires ATTEMPTS concurrent register_for_event() calls at a SLOTS-capacity event
// and asserts exactly SLOTS succeed, the rest are FULL, and no duplicates exist.
import pg from "pg";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const SLOTS = 50;
const ATTEMPTS = 200;

const pool = new pg.Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
  max: 12,
});

async function q(sql, params) {
  const c = await pool.connect();
  try { return await c.query(sql, params); }
  finally { c.release(); }
}

(async () => {
  // fresh test event
  const { rows } = await q(
    `insert into events (name, date, registration_deadline, slots_total, slots_taken, status, scope)
     values ('CONCURRENCY TEST', '2026-12-01', now() + interval '7 days', $1, 0, 'Open', 'Provincial')
     returning id`,
    [SLOTS],
  );
  const eventId = rows[0].id;

  const calls = Array.from({ length: ATTEMPTS }, (_, i) =>
    q(`select register_for_event($1::jsonb) as r`, [
      JSON.stringify({
        event_id: eventId,
        full_name: `Guest ${i}`,
        email: `guest${i}@example.com`,
        chapter: "Pagadian City",
        age: 18,
        consent: true,
      }),
    ]),
  );

  const results = await Promise.all(calls);
  const ok = results.filter((r) => r.rows[0].r.ok === true).length;
  const full = results.filter((r) => r.rows[0].r.code === "FULL").length;

  const { rows: ev } = await q(`select slots_taken from events where id = $1`, [eventId]);
  const { rows: cnt } = await q(
    `select count(*)::int n from event_registrations where event_id = $1`, [eventId],
  );

  // cleanup
  await q(`delete from event_registrations where event_id = $1`, [eventId]);
  await q(`delete from events where id = $1`, [eventId]);
  await pool.end();

  const slotsTaken = ev[0].slots_taken;
  const regCount = cnt[0].n;

  console.log("─".repeat(48));
  console.log(`Attempts:        ${ATTEMPTS}`);
  console.log(`Capacity:        ${SLOTS}`);
  console.log(`Succeeded (ok):  ${ok}`);
  console.log(`Rejected (FULL): ${full}`);
  console.log(`events.slots_taken: ${slotsTaken}`);
  console.log(`registration rows:  ${regCount}`);
  console.log("─".repeat(48));

  const pass =
    ok === SLOTS && full === ATTEMPTS - SLOTS &&
    slotsTaken === SLOTS && regCount === SLOTS;

  if (pass) {
    console.log(`PASS ✓  Exactly ${SLOTS} claimed, 0 overbooking, 0 duplicates.`);
    process.exit(0);
  } else {
    console.log("FAIL ✗  Engine did not behave atomically.");
    process.exit(1);
  }
})().catch((e) => { console.error(e); process.exit(1); });
