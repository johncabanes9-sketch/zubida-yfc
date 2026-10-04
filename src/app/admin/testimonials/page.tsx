import { requirePYH, createServerSupabase } from "@/lib/supabase/admin-auth";
import { AdminShell } from "../_components/admin-shell";
import { TestimonialsAdmin, type TestimonialListItem } from "./_components/testimonials-admin";
import type { ChapterRow, TestimonialRow } from "@/lib/supabase/database.types";

export const metadata = { title: "Manage Testimonials", robots: { index: false } };
export const dynamic = "force-dynamic";

type Row = Pick<TestimonialRow, "id" | "name" | "role" | "quote" | "photo_path" | "chapter_id" | "is_published" | "consent_at">;

export default async function TestimonialsAdminPage() {
  const ctx = await requirePYH();
  const supabase = await createServerSupabase();

  const [{ data }, { data: chaptersData }] = await Promise.all([
    supabase
      .from("testimonials")
      .select("id, name, role, quote, photo_path, chapter_id, is_published, consent_at")
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false }),
    supabase.from("chapters").select("id, name").is("deleted_at", null).order("name"),
  ]);

  const testimonials: TestimonialListItem[] = ((data as Row[] | null) ?? [])
    .filter((r) => r.name && r.quote)
    .map((r) => ({ ...r, name: r.name!, quote: r.quote! }));
  const chapters = (chaptersData as Pick<ChapterRow, "id" | "name">[] | null) ?? [];

  return (
    <AdminShell ctx={ctx} active="testimonials" title="Testimonials">
      <p className="mb-6 max-w-2xl text-sm text-muted">
        Real words from real people, published only with their consent. Changing
        someone&apos;s words needs their consent again. Deleting a testimonial
        erases their name, words and photo — use it when someone withdraws.
      </p>
      <TestimonialsAdmin testimonials={testimonials} chapters={chapters} />
    </AdminShell>
  );
}
