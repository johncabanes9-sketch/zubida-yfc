"use client";

import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, FieldGroup, Input, Textarea } from "@/components/ui/field";
import type { SiteSettingsRow, NavItemRow } from "@/lib/supabase/database.types";

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
    <div className="grid max-w-2xl gap-8">
      <Card>
        <form action={saveSettings}>
          <CardBody className="grid gap-6">
            <FieldGroup title="Identity">
              <Field label="Site name" required>
                <Input name="name" required defaultValue={settings.name} />
              </Field>
              <Field label="Full name" required>
                <Input name="full_name" required defaultValue={settings.full_name} />
              </Field>
              <Field label="Tagline" required>
                <Input name="tagline" required defaultValue={settings.tagline} />
              </Field>
              <Field label="Description" required>
                <Textarea name="description" rows={3} required defaultValue={settings.description} />
              </Field>
              <Field label="Province" required>
                <Input name="province" required defaultValue={settings.province} />
              </Field>
              <Field
                label="Site URL"
                required
                hint="The public address of this site, e.g. https://zubidayfc.org. Used for canonical links and link previews when a page is shared."
              >
                <Input type="url" name="site_url" required defaultValue={settings.site_url ?? ""} />
              </Field>
            </FieldGroup>

            <FieldGroup
              title="Contact"
              description="Leave blank to withhold a channel — the site then shows no email or phone at all, rather than one nobody answers. Fill it in once it is confirmed."
            >
              <Field label="Email">
                <Input type="email" name="email" defaultValue={settings.email} />
              </Field>
              <Field label="Phone">
                <Input name="phone" defaultValue={settings.phone} />
              </Field>
              <Field label="Office address" required>
                <Input name="office" required defaultValue={settings.office} />
              </Field>
            </FieldGroup>

            <FieldGroup title="Socials" description="Leave blank to hide the icon.">
              <Field label="Facebook URL">
                <Input name="facebook_url" defaultValue={settings.facebook_url ?? ""} />
              </Field>
              <Field label="Instagram URL">
                <Input name="instagram_url" defaultValue={settings.instagram_url ?? ""} />
              </Field>
              <Field label="TikTok URL">
                <Input name="tiktok_url" defaultValue={settings.tiktok_url ?? ""} />
              </Field>
            </FieldGroup>

            <FieldGroup title="Footer">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Explore heading" required>
                  <Input
                    name="footer_explore_heading"
                    required
                    defaultValue={settings.footer_explore_heading}
                  />
                </Field>
                <Field label="Reach Us heading" required>
                  <Input
                    name="footer_reach_heading"
                    required
                    defaultValue={settings.footer_reach_heading}
                  />
                </Field>
              </div>
              <Field label="Closing line" required>
                <Input
                  name="footer_closing_line"
                  required
                  defaultValue={settings.footer_closing_line}
                />
              </Field>
            </FieldGroup>

            <div>
              <Button type="submit">Save settings</Button>
            </div>
          </CardBody>
        </form>
      </Card>

      <Card>
        <form action={saveNav}>
          <CardBody className="grid gap-4">
            <FieldGroup
              title="Navigation"
              description="Rename, reorder (lower number appears first), or hide menu items. Links are fixed to existing pages."
            >
              {navItems.map((n) => (
                <div
                  key={n.href}
                  className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_5.5rem_4.5rem]"
                >
                  <input type="hidden" name="href" value={n.href} />
                  <Field label={n.href} required>
                    <Input name={`label:${n.href}`} required defaultValue={n.label} />
                  </Field>
                  <Field label="Order">
                    <Input
                      type="number"
                      name={`order:${n.href}`}
                      min={1}
                      defaultValue={n.sort_order}
                    />
                  </Field>
                  <label className="flex items-center gap-2 pb-2.5">
                    <input
                      type="checkbox"
                      name={`visible:${n.href}`}
                      defaultChecked={n.visible}
                      className="h-4 w-4 rounded border-[var(--rule-strong)] accent-royal-700 dark:accent-gold-400"
                    />
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                      Show
                    </span>
                  </label>
                </div>
              ))}
            </FieldGroup>
            <div>
              <Button type="submit">Save navigation</Button>
            </div>
          </CardBody>
        </form>
      </Card>
    </div>
  );
}
