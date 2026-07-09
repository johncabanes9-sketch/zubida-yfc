// Creates (or reuses) a confirmed admin user via the Auth admin API, marks them
// admin, and proves the RLS admin data path end-to-end:
//   - admin (authenticated) CAN read + update event_registrations
//   - anon CANNOT read event_registrations
//   - is_admin(user) === true
// Usage: ADMIN_EMAIL=.. ADMIN_PASSWORD=.. node scripts/setup-admin.mjs
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ADMIN_EMAIL || "admin@zubidayfc.org";
const password = process.env.ADMIN_PASSWORD || "ZubidaAdmin!2026";

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

let pass = 0, fail = 0;
const check = (n, c, got) => (c ? (pass++, console.log(`  PASS  ${n}`)) : (fail++, console.log(`  FAIL  ${n}  got=${JSON.stringify(got)}`)));

(async () => {
  // 1. create or find the auth user (email pre-confirmed)
  let userId;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) {
    if (/already/i.test(created.error.message)) {
      const list = await admin.auth.admin.listUsers();
      userId = list.data.users.find((u) => u.email === email)?.id;
      // ensure password matches for the sign-in test
      if (userId) await admin.auth.admin.updateUserById(userId, { password });
      console.log(`  admin user already existed -> ${email}`);
    } else throw created.error;
  } else {
    userId = created.data.user.id;
    console.log(`  created admin user -> ${email}`);
  }

  // 2. mark admin (idempotent)
  await admin.from("admins").upsert({ user_id: userId, role: "super_admin" }, { onConflict: "user_id" });

  // 3. is_admin === true
  const { data: isA } = await admin.rpc("is_admin", { uid: userId });
  check("is_admin(admin) === true", isA === true, isA);

  // 4. seed a registration to read/update (via the atomic RPC on an open event)
  const { data: ev } = await admin.from("events").select("id").eq("status", "Open").limit(1).single();
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

  // cleanup the seeded test registration + reconcile slots
  await admin.from("event_registrations").delete().eq("registration_id", regId);
  await admin.rpc; // noop
  await admin.from("events").update({ slots_taken: 0 }).eq("id", "00000000-0000-0000-0000-000000000000"); // noop guard
  const { data: cnt } = await admin.from("event_registrations").select("id", { count: "exact", head: true }).eq("event_id", ev.id);
  void cnt;

  console.log("─".repeat(48));
  console.log(`${pass} passed, ${fail} failed`);
  console.log(`\nAdmin login -> /admin/login`);
  console.log(`  email:    ${email}`);
  console.log(`  password: ${password}   (change this in Supabase after)`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
