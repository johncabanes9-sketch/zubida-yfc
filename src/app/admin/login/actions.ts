"use server";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { createServerSupabase } from "@/lib/supabase/admin-auth";
import { recordAudit } from "@/lib/supabase/audit";

async function logAuth(action: string, userId: string | null, email: string) {
  // Audit never blocks sign-in or sign-out: recordAudit cannot throw, and
  // the IP lookup is guarded the same way.
  let ip: string | null = null;
  try {
    ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  } catch {
    // no request headers available; record the entry without an IP
  }
  await recordAudit({ actorUserId: userId, action, entity: "auth", entityId: email, meta: { ip } });
}

export async function signIn(formData: FormData) {
  const email = String(formData.get("email"));
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: String(formData.get("password")),
  });
  if (error || !data.user) {
    await logAuth("auth.login_failed", null, email);
    redirect("/admin/login?error=invalid");
  }
  await logAuth("auth.login", data.user.id, email);
  (await cookies()).set("last_activity", String(Date.now()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  redirect("/admin");
}

export async function signOut() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) await logAuth("auth.logout", user.id, user.email ?? "");
  await supabase.auth.signOut();
  (await cookies()).set("last_activity", "", { maxAge: 0, path: "/" });
  redirect("/admin/login");
}
