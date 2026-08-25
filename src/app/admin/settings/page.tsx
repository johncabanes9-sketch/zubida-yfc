import { requirePYH, createServerSupabase } from "@/lib/supabase/admin-auth";
import { AdminShell } from "../_components/admin-shell";
import { SettingsForm } from "./_components/settings-form";
import { OptionLists } from "./_components/option-lists";
import {
  updateSiteSettings,
  updateNavItems,
  addRegistrationOption,
  deleteRegistrationOption,
} from "./actions";
import type { SiteSettingsRow, NavItemRow, OptionListRow } from "@/lib/supabase/database.types";

export const metadata = { title: "Site Settings", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ctx = await requirePYH();
  const supabase = await createServerSupabase();
  const [{ data: settings }, { data: nav }, { data: options }] = await Promise.all([
    supabase.from("site_settings").select("*").eq("id", 1).maybeSingle(),
    supabase.from("nav_items").select("*").order("sort_order", { ascending: true }),
    supabase.from("option_lists").select("*").order("sort_order", { ascending: true }),
  ]);

  if (!settings) {
    return (
      <AdminShell ctx={ctx} active="settings" title="Site Settings">
        <p className="glass rounded-2xl p-10 text-center text-muted">
          Settings row missing — run <code>npm run db:migrate</code>.
        </p>
      </AdminShell>
    );
  }

  return (
    <AdminShell ctx={ctx} active="settings" title="Site Settings">
      <SettingsForm
        settings={settings as SiteSettingsRow}
        navItems={(nav as NavItemRow[] | null) ?? []}
        saveSettings={updateSiteSettings}
        saveNav={updateNavItems}
      />
      <div className="mt-6">
        <OptionLists
          rows={(options as OptionListRow[] | null) ?? []}
          addOption={addRegistrationOption}
          deleteOption={deleteRegistrationOption}
        />
      </div>
    </AdminShell>
  );
}
