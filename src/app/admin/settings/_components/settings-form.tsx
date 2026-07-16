"use client";
import { Button } from "@/components/ui/button";
import type { SiteSettingsRow, NavItemRow } from "@/lib/supabase/database.types";

const field = "mt-1 w-full rounded-xl border border-black/10 bg-white/60 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5";
const label = "text-xs font-semibold uppercase tracking-wide text-muted";
const heading = "font-display text-xl font-semibold";

export function SettingsForm({
  settings,
  navItems,
  saveSettings,
  saveNav,
}: {
  settings: SiteSettingsRow;
  navItems: NavItemRow[];
  saveSettings: (formData: FormData) => void;
  saveNav: (formData: FormData) => void;
}) {
  return (
    <div className="grid gap-8">
      <form action={saveSettings} className="glass grid max-w-2xl gap-4 rounded-2xl p-6">
        <h2 className={heading}>Identity</h2>
        <label className="block"><span className={label}>Site name</span>
          <input name="name" required defaultValue={settings.name} className={field} /></label>
        <label className="block"><span className={label}>Full name</span>
          <input name="full_name" required defaultValue={settings.full_name} className={field} /></label>
        <label className="block"><span className={label}>Tagline</span>
          <input name="tagline" required defaultValue={settings.tagline} className={field} /></label>
        <label className="block"><span className={label}>Description</span>
          <textarea name="description" rows={3} required defaultValue={settings.description} className={field} /></label>
        <label className="block"><span className={label}>Province</span>
          <input name="province" required defaultValue={settings.province} className={field} /></label>

        <h2 className={heading}>Contact</h2>
        <label className="block"><span className={label}>Email</span>
          <input type="email" name="email" required defaultValue={settings.email} className={field} /></label>
        <label className="block"><span className={label}>Phone</span>
          <input name="phone" required defaultValue={settings.phone} className={field} /></label>
        <label className="block"><span className={label}>Office address</span>
          <input name="office" required defaultValue={settings.office} className={field} /></label>

        <h2 className={heading}>Socials</h2>
        <p className="text-xs text-muted">Leave blank to hide the icon.</p>
        <label className="block"><span className={label}>Facebook URL</span>
          <input name="facebook_url" defaultValue={settings.facebook_url ?? ""} className={field} /></label>
        <label className="block"><span className={label}>Instagram URL</span>
          <input name="instagram_url" defaultValue={settings.instagram_url ?? ""} className={field} /></label>

        <h2 className={heading}>Footer</h2>
        <div className="grid grid-cols-2 gap-4">
          <label className="block"><span className={label}>Explore heading</span>
            <input name="footer_explore_heading" required defaultValue={settings.footer_explore_heading} className={field} /></label>
          <label className="block"><span className={label}>Reach Us heading</span>
            <input name="footer_reach_heading" required defaultValue={settings.footer_reach_heading} className={field} /></label>
        </div>
        <label className="block"><span className={label}>Closing line</span>
          <input name="footer_closing_line" required defaultValue={settings.footer_closing_line} className={field} /></label>

        <div><Button type="submit">Save settings</Button></div>
      </form>

      <form action={saveNav} className="glass grid max-w-2xl gap-4 rounded-2xl p-6">
        <h2 className={heading}>Navigation</h2>
        <p className="text-xs text-muted">
          Rename, reorder (lower number appears first), or hide menu items. Links are fixed to existing pages.
        </p>
        {navItems.map((n) => (
          <div key={n.href} className="grid grid-cols-[1fr_5rem_4rem] items-end gap-3">
            <input type="hidden" name="href" value={n.href} />
            <label className="block">
              <span className={label}>{n.href}</span>
              <input name={`label:${n.href}`} required defaultValue={n.label} className={field} />
            </label>
            <label className="block">
              <span className={label}>Order</span>
              <input type="number" name={`order:${n.href}`} min={1} defaultValue={n.sort_order} className={field} />
            </label>
            <label className="flex items-center gap-2 pb-2">
              <input type="checkbox" name={`visible:${n.href}`} defaultChecked={n.visible} />
              <span className={label}>Show</span>
            </label>
          </div>
        ))}
        <div><Button type="submit">Save navigation</Button></div>
      </form>
    </div>
  );
}
