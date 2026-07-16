"use server";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { createServerSupabase } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/server";

async function logAuth(action: string, userId: string | null, email: string) {
  try {
    const hdrs = await headers();
    const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    await createServiceClient().from("audit_log").insert({
      actor_user_id: userId,
      action,
      entity: "auth",
      entity_id: email,
      meta: { ip },
    });
  } catch {
    // audit is best-effort; never block login on logging failure
  }
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
