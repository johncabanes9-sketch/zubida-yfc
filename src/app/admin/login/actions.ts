"use server";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/admin-auth";

export async function signIn(formData: FormData) {
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
  });
  if (error) redirect("/admin/login?error=invalid");
  redirect("/admin");
}

export async function signOut() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
