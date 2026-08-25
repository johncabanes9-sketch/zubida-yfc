"use server";
import { revalidatePath } from "next/cache";
import { createServerSupabase, requirePYH } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { siteSettingsSchema, registrationOptionSchema } from "@/lib/validation/site";

async function audit(
  userId: string,
  action: string,
  entity = "site_settings",
  entityId = "1",
) {
  try {
    await createServiceClient()
      .from("audit_log")
      .insert({ actor_user_id: userId, action, entity, entity_id: entityId });
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
      tiktok_url: input.tiktok_url || null,
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

/** Add one value to `gender` or `shirt_size`.
 *
 *  The list key is validated against the same two keys the table's check
 *  constraint allows, so a tampered form field is refused here rather than
 *  relying on the database to reject it. The value is trimmed and length-capped
 *  because it renders in a public dropdown.
 *
 *  New options go to the end: sort_order is one past the current highest, so
 *  adding a size never reorders the ones already there. */
export async function addRegistrationOption(formData: FormData): Promise<{ error?: string }> {
  const ctx = await requirePYH();
  const parsed = registrationOptionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid option" };
  const { list_key, value } = parsed.data;

  const supabase = await createServerSupabase();
  const { data: last } = await supabase
    .from("option_lists")
    .select("sort_order")
    .eq("list_key", list_key)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((last as { sort_order: number } | null)?.sort_order ?? 0) + 1;

  const { data, error } = await supabase
    .from("option_lists")
    .insert({ list_key, value, sort_order: nextOrder })
    .select("id")
    .single();
  // The unique (list_key, value) constraint is the one an admin will actually
  // hit, by adding a size that is already there. Say so plainly instead of
  // surfacing a Postgres error string.
  if (error) {
    return { error: error.code === "23505" ? `"${value}" is already in that list.` : error.message };
  }

  await audit(ctx.userId, "option.create", "option_lists", (data as { id: string }).id);
  revalidatePath("/admin/settings");
  revalidatePath("/events");
  revalidatePath("/");
  return {};
}

/** Remove one value from a list.
 *
 *  Nothing references option_lists, so this cannot orphan a row: a registration
 *  keeps the text it was submitted with, which is the historically correct
 *  answer. Deleting the last option in a list is allowed — the loader falls
 *  back to the built-in values rather than serving an empty dropdown. */
export async function deleteRegistrationOption(id: string): Promise<{ error?: string }> {
  const ctx = await requirePYH();
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("option_lists").delete().eq("id", id);
  if (error) return { error: error.message };

  await audit(ctx.userId, "option.delete", "option_lists", id);
  revalidatePath("/admin/settings");
  revalidatePath("/events");
  revalidatePath("/");
  return {};
}
