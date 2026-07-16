import { requirePYH, createServerSupabase } from "@/lib/supabase/admin-auth";
import { AdminShell } from "../_components/admin-shell";
import { UsersTable, type UserRow } from "./_components/users-table";
import { CreateUserForm } from "./_components/user-form";
import { createClusterHead } from "./actions";

export const metadata = { title: "User Management", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const ctx = await requirePYH();
  const supabase = await createServerSupabase();
  const { data: admins } = await supabase
    .from("admins")
    .select("user_id, full_name, username, cluster_id, is_active")
    .eq("role", "cluster_head")
    .is("deleted_at", null);
  const { data: clusters } = await supabase.from("clusters").select("id, name").order("name");
  const clusterMap = new Map((clusters as { id: string; name: string }[] | null ?? []).map((c) => [c.id, c.name]));

  const rows: UserRow[] = ((admins as { user_id: string; full_name: string | null; username: string | null; cluster_id: string | null; is_active: boolean }[] | null) ?? []).map((a) => ({
    user_id: a.user_id,
    full_name: a.full_name,
    username: a.username,
    cluster_name: a.cluster_id ? clusterMap.get(a.cluster_id) ?? null : null,
    is_active: a.is_active,
  }));

  return (
    <AdminShell ctx={ctx} active="users" title="Cluster Heads">
      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <UsersTable rows={rows} />
        <div>
          <h2 className="mb-3 font-display text-lg font-semibold">Add cluster head</h2>
          <CreateUserForm action={createClusterHead} clusters={(clusters as { id: string; name: string }[]) ?? []} />
        </div>
      </div>
    </AdminShell>
  );
}
