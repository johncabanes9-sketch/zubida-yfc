// Creates (or reuses) a confirmed provincial youth head via the Auth admin API
// and proves the RLS admin data path end-to-end:
//   - the PYH (authenticated) CAN read + update event_registrations
//   - anon CANNOT read event_registrations
//   - is_admin(user) === true
//
// This is the ONLY way a PYH account comes into existence: /admin/users can
// create cluster heads and nothing else. So the role it writes has to be one the
// application actually recognizes (src/lib/rbac.ts) — it seeded the pre-RBAC
// `super_admin` until 2026-08-15, which passes is_admin() and signs in fine but
// fails is_pyh(), so the account it produced was silently redirected away from
// the page CMS, settings, and every requirePYH action. prove:rbac now asserts
// the role matches.
//
// Usage: ADMIN_EMAIL=.. ADMIN_PASSWORD=.. node scripts/setup-admin.mjs
//        RESET_PASSWORD=1 ...   to also reset an existing account's password
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ADMIN_EMAIL || "admin@zubidayfc.org";
const password = process.env.ADMIN_PASSWORD || "ZubidaAdmin!2026";
const fullName = process.env.ADMIN_NAME || "Zubida Provincial Youth Head";
const resetPassword = process.env.RESET_PASSWORD === "1";

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

let pass = 0, fail = 0;
const check = (n, c, got) => (c ? (pass++, console.log(`  PASS  ${n}`)) : (fail++, console.log(`  FAIL  ${n}  got=${JSON.stringify(got)}`)));

(async () => {
  // 1. create or find the auth user (email pre-confirmed)
  let userId;
  let reused = false;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) {
    if (/already/i.test(created.error.message)) {
      const list = await admin.auth.admin.listUsers();
      userId = list.data.users.find((u) => u.email === email)?.id;
      reused = true;
      // Only on request. The default target is a real account, and a setup
      // script that silently changes someone's password when re-run is a
      // footgun — the sign-in check below fails loudly instead, which is the
      // honest outcome when the stored password is not the one supplied.
      if (userId && resetPassword) {
        await admin.auth.admin.updateUserById(userId, { password });
        console.log(`  reset the password for ${email} (RESET_PASSWORD=1)`);
      }
      console.log(`  admin user already existed -> ${email}`);
    } else throw created.error;
  } else {
    userId = created.data.user.id;
    console.log(`  created admin user -> ${email}`);
  }

  // 2. mark them the provincial youth head (idempotent)
  await admin.from("admins").upsert(
    { user_id: userId, role: "provincial_youth_head", full_name: fullName, is_active: true },
    { onConflict: "user_id" },
  );

  // 3. is_admin === true
  const { data: isA } = await admin.rpc("is_admin", { uid: userId });
  check("is_admin(admin) === true", isA === true, isA);

  // 4. seed a registration to read/update (via the atomic RPC).
  //
  // On its own event, not whichever row happens to be Open. Picking by status
  // alone matched the events 0019 soft-deleted — retired rows keep status 'Open'
  // — so the proof attached a registration to an event nobody should be able to
  // register for, and left the check dependent on the database having any events
  // at all. Created here, removed in step 9.
  const deadline = new Date(Date.now() + 7 * 864e5).toISOString();
  const { data: ev, error: evErr } = await admin.from("events").insert({
    name: "SETUP ADMIN PROOF", date: "2026-12-01", registration_deadline: deadline,
    slots_total: 5, slots_taken: 0, status: "Open", scope: "Provincial", created_by: userId,
  }).select("id").single();
  if (evErr) throw evErr;
  const email2 = `admintest_${Date.now()}@test.com`;
  const { data: reg } = await admin.rpc("register_for_event", {
    p: { event_id: ev.id, full_name: "Admin Test", email: email2, chapter: "Molave", age: 20, consent: true },
  });
  const regId = reg.registration_id;

  // 5. sign in as admin -> authenticated client bound to that JWT
  const authed = createClient(url, anonKey, { auth: { persistSession: false } });
  const signIn = await authed.auth.signInWithPassword({ email, password });
  check("admin can sign in", !signIn.error && !!signIn.data.session, signIn.error?.message);

  // 6. admin authenticated read of registrations (RLS should allow)
  const readAdmin = await authed.from("event_registrations").select("registration_id,status").eq("registration_id", regId);
  check("admin CAN read registrations", !readAdmin.error && readAdmin.data.length === 1, readAdmin.error?.message ?? readAdmin.data);

  // 7. admin update status (RLS should allow)
  const upd = await authed.from("event_registrations").update({ status: "approved" }).eq("registration_id", regId).select("status");
  check("admin CAN approve (update)", !upd.error && upd.data?.[0]?.status === "approved", upd.error?.message ?? upd.data);

  // 8. anon CANNOT read registrations (RLS blocks -> empty)
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  const anonRead = await anon.from("event_registrations").select("registration_id").limit(5);
  check("anon CANNOT read registrations", (anonRead.data?.length ?? 0) === 0, anonRead.data);

  // 9. remove the proof event and its registration. The 0020 trigger releases
  //    the seat on delete, so no slot drift is left behind.
  await admin.from("event_registrations").delete().eq("event_id", ev.id);
  await admin.from("events").delete().eq("id", ev.id);
  const { data: leftover } = await admin.from("events").select("id").eq("id", ev.id);
  check("the proof event was cleaned up", (leftover?.length ?? 0) === 0, leftover);

  console.log("─".repeat(48));
  console.log(`${pass} passed, ${fail} failed`);
  console.log(`\nProvincial youth head -> /admin/login`);
  console.log(`  email:    ${email}`);
  if (reused && !resetPassword) {
    console.log(`  password: unchanged (re-run with RESET_PASSWORD=1 to set it to the one supplied)`);
  } else {
    console.log(`  password: ${password}   (change this in Supabase after)`);
  }
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
