import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import type { AdminContext, AdminRole } from "@/lib/rbac";
import type { AdminRow } from "./database.types";

export async function createServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (all) => {
          try {
            all.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // called from a Server Component — safe to ignore; middleware/actions refresh
          }
        },
      },
    },
  );
}

export async function requireAdmin() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const { data: isAdmin } = await supabase.rpc("is_admin", { uid: user.id });
  if (isAdmin !== true) redirect("/admin/login?error=not-admin");
  return user;
}

export async function loadAdminContext(): Promise<AdminContext> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const { data } = await supabase
    .from("admins")
    .select("role, cluster_id, is_active, full_name, deleted_at")
    .eq("user_id", user.id)
    .maybeSingle();
  const row = data as Pick<AdminRow, "role" | "cluster_id" | "is_active" | "full_name" | "deleted_at"> | null;
  if (!row || row.deleted_at || !row.is_active) redirect("/admin/login?error=not-admin");
  return {
    userId: user.id,
    role: row.role as AdminRole,
    isPYH: row.role === "provincial_youth_head",
    clusterId: row.cluster_id,
    fullName: row.full_name,
  };
}

export async function requirePYH(): Promise<AdminContext> {
  const ctx = await loadAdminContext();
  if (!ctx.isPYH) redirect("/admin?error=forbidden");
  return ctx;
}

export async function requireClusterAccess(clusterId: string | null): Promise<AdminContext> {
  const ctx = await loadAdminContext();
  if (ctx.isPYH) return ctx;
  if (clusterId === null || clusterId !== ctx.clusterId) redirect("/admin?error=forbidden");
  return ctx;
}
