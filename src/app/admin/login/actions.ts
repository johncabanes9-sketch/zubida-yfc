"use server";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { createServerSupabase } from "@/lib/supabase/admin-auth";
import { recordAudit } from "@/lib/supabase/audit";
import {
  SIGN_IN_LIMITS,
  SIGN_IN_NOTICES,
  signInSchema,
  type SignInState,
} from "@/lib/validation/sign-in";

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

/** Returns a refusal instead of redirecting so the form keeps the email the
 *  user typed. Success redirects. One message for "no such user" and "wrong
 *  password" alike, so the form can't be used to probe which emails exist. */
export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
  });
  const typedEmail = String(formData.get("email") ?? "").slice(0, SIGN_IN_LIMITS.email);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your email and password.", fieldError: true, email: typedEmail };
  }
  const { email, password } = parsed.data;

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    await logAuth("auth.login_failed", null, email);
    const message =
      error?.status === 429
        ? "Too many sign-in attempts. Wait a minute, then try again."
        : SIGN_IN_NOTICES.invalid;
    return { error: message, fieldError: true, email };
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
