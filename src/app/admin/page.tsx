import { requireAdmin, createServerSupabase } from "@/lib/supabase/admin-auth";
import { RegistrationsTable, type Row } from "@/components/admin/registrations-table";
import { signOut } from "./login/actions";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Admin Dashboard", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  await requireAdmin();
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("event_registrations")
    .select("registration_id, full_name, email, chapter, status, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = (data as Row[] | null) ?? [];
  const total = rows.length;
  const pending = rows.filter((r) => r.status === "pending").length;
  const approved = rows.filter((r) => r.status === "approved").length;

  return (
    <section className="mx-auto max-w-7xl px-4 pb-24 pt-28 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-gold-600 dark:text-gold-400">
            Admin
          </p>
          <h1 className="font-display text-3xl font-semibold">Registrations</h1>
        </div>
        <form action={signOut}>
          <Button variant="ghost" size="sm" type="submit">Sign out</Button>
        </form>
      </div>

      <div className="mt-8 grid grid-cols-3 gap-4">
        <Stat label="Total" value={total} />
        <Stat label="Pending" value={pending} />
        <Stat label="Approved" value={approved} />
      </div>

      <div className="mt-10">
        <RegistrationsTable initial={rows} />
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass rounded-2xl p-5 shadow-card">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="font-display text-3xl font-semibold text-royal-700 dark:text-gold-300">
        {value}
      </p>
    </div>
  );
}
