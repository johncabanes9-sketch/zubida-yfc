import { requirePYH, createServerSupabase } from "@/lib/supabase/admin-auth";
import { AdminShell } from "../_components/admin-shell";
import { NewsAdmin, type NewsListItem } from "./_components/news-admin";
import type { NewsPostRow } from "@/lib/supabase/database.types";

export const metadata = { title: "Manage News", robots: { index: false } };
export const dynamic = "force-dynamic";

type PostQueryRow = Pick<
  NewsPostRow,
  "id" | "title" | "excerpt" | "category" | "author" | "external_url" | "published_on" | "cover_path" | "is_published"
>;

export default async function NewsAdminPage() {
  const ctx = await requirePYH();
  const supabase = await createServerSupabase();

  const { data } = await supabase
    .from("news_posts")
    .select("id, title, excerpt, category, author, external_url, published_on, cover_path, is_published")
    .is("deleted_at", null)
    .order("published_on", { ascending: false })
    .order("created_at", { ascending: false });

  const posts: NewsListItem[] = ((data as PostQueryRow[] | null) ?? []).map((p) => ({ ...p }));

  return (
    <AdminShell ctx={ctx} active="news" title="News">
      <p className="mb-6 max-w-2xl text-sm text-muted">
        Each post is a card on the News page that links to where the full story
        lives — usually the Facebook post. New posts save as drafts and stay off
        the public site until you publish them.
      </p>
      <NewsAdmin posts={posts} today={new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" })} />
    </AdminShell>
  );
}
