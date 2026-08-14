"use server";
import { revalidatePath } from "next/cache";
import { createServerSupabase, requirePYH } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { siteSettingsSchema } from "@/lib/validation/site";

async function audit(userId: string, action: string) {
  try {
    await createServiceClient()
      .from("audit_log")
      .insert({ actor_user_id: userId, action, entity: "site_settings", entity_id: "1" });
  } catch {
    // audit is best-effort; never block the save on logging failure
  }
}

export async function updateSiteSettings(formData: FormData) {
  const ctx = await requirePYH();
  const raw = Object.fromEntries(formData.entries());
  const parsed = siteSettingsSchema.safeParse(raw);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid settings");
  const input = parsed.data;

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("site_settings")
    .update({
      name: input.name,
      full_name: input.full_name,
      tagline: input.tagline,
      description: input.description,
      province: input.province,
      site_url: input.site_url,
      email: input.email,
      phone: input.phone,
      office: input.office,
      facebook_url: input.facebook_url || null,
      instagram_url: input.instagram_url || null,
      footer_explore_heading: input.footer_explore_heading,
      footer_reach_heading: input.footer_reach_heading,
      footer_closing_line: input.footer_closing_line,
      updated_at: new Date().toISOString(),
      updated_by: ctx.userId,
    })
    .eq("id", 1)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Not permitted or not found");

  await audit(ctx.userId, "settings.update");
  // Footer + navbar render on every page, so the whole layout must regenerate.
  revalidatePath("/", "layout");
  revalidatePath("/admin/settings");
}

export async function updateNavItems(formData: FormData) {
  const ctx = await requirePYH();
  // hrefs come from the rendered form, which is seeded from the DB — never
  // from free text. Insert/delete are not exposed.
  const hrefs = formData.getAll("href").map(String);
  const supabase = await createServerSupabase();

  for (const href of hrefs) {
    const label = String(formData.get(`label:${href}`) ?? "").trim();
    if (label.length === 0 || label.length > 60) throw new Error(`Invalid label for ${href}`);
    // Order comes from the number the admin typed — it is what they see on screen.
    const order = Number(formData.get(`order:${href}`));
    if (!Number.isInteger(order) || order < 1 || order > 999) throw new Error(`Invalid order for ${href}`);
    const visible = formData.get(`visible:${href}`) === "on";
    const { error } = await supabase
      .from("nav_items")
      .update({ label, visible, sort_order: order })
      .eq("href", href);
    if (error) throw new Error(error.message);
  }

  await audit(ctx.userId, "nav.update");
  revalidatePath("/", "layout");
  revalidatePath("/admin/settings");
}
