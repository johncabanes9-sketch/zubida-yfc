"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePYH } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { createUserSchema, editUserSchema, passwordSchema } from "@/lib/validation/user";

async function audit(userId: string, action: string, target: string) {
  try {
    await createServiceClient().from("audit_log").insert({ actor_user_id: userId, action, entity: "admins", entity_id: target });
  } catch {
    // audit is best-effort; never block the mutation on logging failure
  }
}

export async function createClusterHead(formData: FormData) {
  const ctx = await requirePYH();
  const input = createUserSchema.parse(Object.fromEntries(formData.entries()));
  const svc = createServiceClient();
  const created = await svc.auth.admin.createUser({ email: input.email, password: input.password, email_confirm: true });
  if (created.error) throw new Error(created.error.message);
  const newId = created.data.user.id;
  const { error } = await svc.from("admins").upsert({
    user_id: newId,
    role: "cluster_head",
    full_name: input.full_name,
    username: input.username || null,
    cluster_id: input.cluster_id,
    is_active: input.is_active,
  }, { onConflict: "user_id" });
  if (error) { await svc.auth.admin.deleteUser(newId); throw new Error(error.message); }
  await audit(ctx.userId, "user.create", newId);
  revalidatePath("/admin/users");
  redirect("/admin/users");
}

export async function updateClusterHead(userId: string, formData: FormData) {
  const ctx = await requirePYH();
  const input = editUserSchema.parse(Object.fromEntries(formData.entries()));
  const svc = createServiceClient();
  const { error } = await svc.from("admins").update({
    full_name: input.full_name,
    username: input.username || null,
    cluster_id: input.cluster_id,
  }).eq("user_id", userId).eq("role", "cluster_head");
  if (error) throw new Error(error.message);
  await audit(ctx.userId, "user.update", userId);
  revalidatePath("/admin/users");
  redirect("/admin/users");
}

export async function setActive(userId: string, active: boolean) {
  const ctx = await requirePYH();
  const svc = createServiceClient();
  await svc.from("admins").update({ is_active: active }).eq("user_id", userId).eq("role", "cluster_head");
  // Ban the auth user while inactive so they cannot sign in.
  await svc.auth.admin.updateUserById(userId, { ban_duration: active ? "none" : "876000h" });
  await audit(ctx.userId, active ? "user.activate" : "user.deactivate", userId);
  revalidatePath("/admin/users");
}

export async function resetPassword(userId: string, formData: FormData) {
  const ctx = await requirePYH();
  const { password } = passwordSchema.parse(Object.fromEntries(formData.entries()));
  const svc = createServiceClient();
  const { error } = await svc.auth.admin.updateUserById(userId, { password });
  if (error) throw new Error(error.message);
  await audit(ctx.userId, "user.reset_password", userId);
  revalidatePath("/admin/users");
}

export async function deleteClusterHead(userId: string) {
  const ctx = await requirePYH();
  const svc = createServiceClient();
  // Soft-delete the admin row, then remove the auth user so they cannot log in.
  await svc.from("admins").update({ deleted_at: new Date().toISOString(), is_active: false }).eq("user_id", userId).eq("role", "cluster_head");
  await svc.auth.admin.deleteUser(userId);
  await audit(ctx.userId, "user.delete", userId);
  revalidatePath("/admin/users");
}
