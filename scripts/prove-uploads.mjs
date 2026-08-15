// Proves upload validation rejects forged/oversized files and that a real
// upload round-trips through Storage without leaving orphans.
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
const { validateImage, sniffImageType, MAX_BYTES } = await import("../src/lib/images/validate.ts");
const { reapEventImages } = await import("../src/lib/images/reap.ts");

let pass = 0, fail = 0;
const check = (n, c, got) => c ? (pass++, console.log(`  PASS  ${n}`)) : (fail++, console.log(`  FAIL  ${n}  got=${JSON.stringify(got)}`));

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const PNG  = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP = new Uint8Array([0x52,0x49,0x46,0x46, 0,0,0,0, 0x57,0x45,0x42,0x50]);
// "MZ" — a Windows executable. This is the attack: a real .exe with an image MIME.
const EXE  = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0, 0, 0, 0]);
const SVG  = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

check("sniffs jpeg", sniffImageType(JPEG) === "image/jpeg", sniffImageType(JPEG));
check("sniffs png",  sniffImageType(PNG)  === "image/png",  sniffImageType(PNG));
check("sniffs webp", sniffImageType(WEBP) === "image/webp", sniffImageType(WEBP));

// The core security assertion: the bytes decide, so a forged declaration is irrelevant.
check("REJECTS exe (MZ) even if the client calls it a jpeg", validateImage(EXE, EXE.length).ok === false, validateImage(EXE, EXE.length));
check("REJECTS svg (script vector)",      validateImage(SVG, SVG.length).ok === false, validateImage(SVG, SVG.length));
check("REJECTS oversized file",           validateImage(JPEG, MAX_BYTES + 1).ok === false, validateImage(JPEG, MAX_BYTES + 1));
// Positive control — without this an always-reject bug would pass everything above.
check("ACCEPTS a real jpeg",              validateImage(JPEG, JPEG.length).ok === true, validateImage(JPEG, JPEG.length));
// The renamed-file case: a real PNG that a browser labels image/jpeg (because the
// user renamed it .jpg) must be ACCEPTED and reported as png, so the caller stores
// the correct contentType. Guards against reintroducing a declared-vs-actual check.
const pngResult = validateImage(PNG, PNG.length);
check("ACCEPTS a real png regardless of what the client called it",
      pngResult.ok === true && pngResult.mime === "image/png", pngResult);

// ── Reap-on-delete: event_images + storage object must not outlive the event ──
// deleteEvent is a server action (auth context + Next.js request scope), so it
// can't be invoked from a plain node script. Instead we import and call the
// REAL reapEventImages() (src/lib/images/reap.ts) — the same function
// deleteEvent calls — against the real hosted DB and bucket, and assert on
// the outcome. This exercises the actual reap code path, not a hand-mirrored
// copy, so a future edit to reap.ts can't drift out of sync with this test.
// It does NOT exercise deleteEvent's auth guards or its soft-delete write —
// that end-to-end path is covered by Task 10's manual verification.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !service) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const admin = createClient(url, service, { auth: { persistSession: false } });

(async () => {
  const stamp = Date.now();
  let eventId;
  let key;
  try {
    // Fixture event. cluster_id/created_by are nullable and irrelevant here —
    // event_images just needs a real events.id to satisfy its FK.
    const deadline = new Date(Date.now() + 7 * 864e5).toISOString();
    const { data: ev, error: evErr } = await admin
      .from("events")
      .insert({ name: `prove-uploads reap ${stamp}`, date: "2026-12-01", registration_deadline: deadline, slots_total: 1 })
      .select("id").single();
    if (evErr) throw new Error(`fixture event insert failed: ${evErr.message}`);
    eventId = ev.id;

    // Real JPEG bytes + matching contentType, so the bucket's allowed_mime_types
    // check doesn't reject the fixture upload for an unrelated reason.
    const uuid = crypto.randomUUID();
    const filename = `${uuid}.jpg`;
    key = `events/${eventId}/${filename}`;
    const folder = `events/${eventId}`;

    const up = await admin.storage.from("media").upload(key, JPEG, { contentType: "image/jpeg", upsert: false });
    check("fixture upload to storage succeeds", !up.error, up.error?.message);

    const { data: imgRow, error: imgErr } = await admin
      .from("event_images")
      .insert({ event_id: eventId, path: key, sort_order: 0 })
      .select("id").single();
    check("fixture event_images row inserted", !imgErr, imgErr?.message);

    // POSITIVE CONTROL: prove the object actually exists BEFORE the reap. Using
    // list() on the parent folder (not download/signedUrl) because it's the
    // same call the reap-verification below reuses to prove absence — one
    // existence-check method, used symmetrically before and after.
    const before = await admin.storage.from("media").list(folder);
    const existedBefore = !before.error && before.data?.some((f) => f.name === filename);
    check("POSITIVE CONTROL: object exists in bucket before reap", existedBefore, before.error?.message ?? before.data);

    // Call the REAL reap function — the same one deleteEvent calls.
    const reapResult = await reapEventImages(admin, eventId);
    check("reapEventImages returns no error on the happy path", !reapResult.error, reapResult.error);

    const rowsAfter = await admin.from("event_images").select("id").eq("event_id", eventId);
    check("event_images rows gone after reap", (rowsAfter.data?.length ?? -1) === 0, rowsAfter.data);

    const after = await admin.storage.from("media").list(folder);
    const goneAfter = !after.error && !after.data?.some((f) => f.name === filename);
    check("storage object gone after reap", goneAfter, after.error?.message ?? after.data);
  } catch (e) {
    fail++;
    console.log(`  FAIL  reap-on-delete setup/assertion threw  got=${e.message}`);
  } finally {
    // Cleanup, best-effort, even on a failure path above. Storage remove() is
    // idempotent (no error on an already-missing object), so calling it even
    // when the reap already succeeded is safe.
    if (key) await admin.storage.from("media").remove([key]);
    if (eventId) {
      await admin.from("event_images").delete().eq("event_id", eventId);
      await admin.from("events").delete().eq("id", eventId);
    }
  }

  console.log("─".repeat(48));
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
