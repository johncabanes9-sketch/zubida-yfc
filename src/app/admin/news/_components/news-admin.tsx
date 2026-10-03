"use client";
import { fieldClass, labelClass } from "@/components/ui/field";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { ExternalLink, Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { publicUrl } from "@/lib/images/paths";
import { NEWS_CATEGORIES } from "@/lib/validation/news";
import {
  createNewsPost,
  deleteNewsPost,
  removeNewsCover,
  setNewsPostPublished,
  updateNewsPost,
  uploadNewsCover,
} from "../actions";

export type NewsListItem = {
  id: string;
  title: string;
  excerpt: string;
  category: string;
  author: string | null;
  external_url: string | null;
  published_on: string;
  cover_path: string | null;
  is_published: boolean;
};

type RunAction = (fn: () => Promise<{ error?: string }>, okText: string, onOk?: () => void) => void;

/** Same browser-side cap as the gallery and leader photos (Vercel's 4.5MB body limit). */
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

export function NewsAdmin({ posts, today }: { posts: NewsListItem[]; today: string }) {
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const run: RunAction = (fn, okText, onOk) => {
    setNotice(null);
    start(async () => {
      let res: { error?: string };
      try {
        res = await fn();
      } catch {
        res = { error: "That did not go through. If you were uploading, try a smaller file." };
      }
      if (res.error) {
        setNotice({ kind: "error", text: res.error });
        return;
      }
      setNotice({ kind: "ok", text: okText });
      onOk?.();
    });
  };

  return (
    <div className="grid gap-8">
      {notice && (
        <p
          role="status"
          className={`rounded-xl px-4 py-3 text-sm ${
            notice.kind === "error"
              ? "bg-rose-500/10 text-rose-700 dark:text-rose-300"
              : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          }`}
        >
          {notice.text}
        </p>
      )}

      <div className="glass rounded-2xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-semibold">Add a post</h2>
          <Button
            size="sm"
            onClick={() => {
              setEditingId(null);
              setNotice(null);
              setCreating((v) => !v);
            }}
          >
            <Plus className="h-4 w-4" /> {creating ? "Close" : "New post"}
          </Button>
        </div>
        {creating && (
          <div className="mt-5 border-t border-black/5 pt-5 dark:border-white/10">
            <PostFields
              today={today}
              pending={pending}
              submitLabel="Create draft"
              onCancel={() => setCreating(false)}
              onSubmit={(fd) => run(() => createNewsPost(fd), "Post created as a draft.", () => setCreating(false))}
            />
          </div>
        )}
      </div>

      {posts.length === 0 ? (
        <p className="glass rounded-2xl p-10 text-center text-muted">No posts yet. Add one above.</p>
      ) : (
        <ul className="grid gap-3" aria-label="News posts">
          {posts.map((p) => (
            <li key={p.id} className="glass rounded-2xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-display text-lg font-semibold">
                    <span className="break-words">{p.title}</span>
                    {!p.is_published && (
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                        Draft
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted">
                    {[p.category, p.published_on, p.author].filter(Boolean).join(" · ")}
                  </p>
                  {p.external_url ? (
                    <a
                      href={p.external_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-xs text-royal-700 underline dark:text-gold-300"
                    >
                      <ExternalLink className="h-3 w-3 shrink-0" /> <span className="truncate">{p.external_url}</span>
                    </a>
                  ) : (
                    <p className="mt-1 text-xs text-muted">No link — the card will not be clickable.</p>
                  )}
                </div>

                {editingId !== p.id && (
                  <div className="flex flex-wrap gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() =>
                        run(
                          () => setNewsPostPublished(p.id, !p.is_published),
                          p.is_published ? "Post unpublished." : "Post published.",
                        )
                      }
                    >
                      {p.is_published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      {p.is_published ? "Unpublish" : "Publish"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setCreating(false);
                        setNotice(null);
                        setEditingId(p.id);
                      }}
                    >
                      <Pencil className="h-4 w-4" /> Edit
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      aria-label={`Delete post: ${p.title}`}
                      onClick={() => {
                        if (!confirm(`Delete "${p.title}"? Its cover image is deleted too.`)) return;
                        run(() => deleteNewsPost(p.id), "Post deleted.");
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                    </Button>
                  </div>
                )}
              </div>

              {editingId === p.id && (
                <div className="mt-5 border-t border-black/5 pt-5 dark:border-white/10">
                  <PostFields
                    post={p}
                    today={today}
                    pending={pending}
                    submitLabel="Save"
                    onCancel={() => setEditingId(null)}
                    onSubmit={(fd) => run(() => updateNewsPost(p.id, fd), "Post saved.", () => setEditingId(null))}
                  />
                  <CoverField post={p} pending={pending} onRun={run} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PostFields({
  post,
  today,
  pending,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  post?: NewsListItem;
  today: string;
  pending: boolean;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (fd: FormData) => void;
}) {
  return (
    <form
      // onSubmit, not a form action: React 19 resets a form whose action returns,
      // and onSubmit returns before the server answers — a rejected save would
      // wipe what was typed.
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(new FormData(e.currentTarget));
      }}
      className="grid max-w-xl gap-4"
    >
      <label className="block">
        <span className={labelClass}>Title</span>
        <input name="title" required maxLength={200} defaultValue={post?.title} className={fieldClass} />
      </label>
      <label className="block">
        <span className={labelClass}>Summary</span>
        <textarea name="excerpt" required rows={3} maxLength={600} defaultValue={post?.excerpt} className={fieldClass} />
        <span className="text-xs opacity-70">Two or three sentences shown on the card.</span>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={labelClass}>Format</span>
          <select name="category" required defaultValue={post?.category ?? "Announcement"} className={fieldClass}>
            {NEWS_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelClass}>Date</span>
          <input name="published_on" type="date" required defaultValue={post?.published_on ?? today} className={fieldClass} />
        </label>
      </div>
      <label className="block">
        <span className={labelClass}>Link to the full story</span>
        <input
          name="external_url"
          type="url"
          inputMode="url"
          maxLength={500}
          placeholder="https://www.facebook.com/…"
          defaultValue={post?.external_url ?? ""}
          className={fieldClass}
        />
        <span className="text-xs opacity-70">Must start with https://. Leave blank for a card with no link.</span>
      </label>
      <label className="block">
        <span className={labelClass}>Author</span>
        <input name="author" maxLength={120} defaultValue={post?.author ?? ""} className={fieldClass} />
        <span className="text-xs opacity-70">Leave blank to withhold</span>
      </label>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {submitLabel}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** Cover image for an existing post; same permission gate as gallery uploads. */
function CoverField({ post, pending, onRun }: { post: NewsListItem; pending: boolean; onRun: RunAction }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [coverConsent, setCoverConsent] = useState(false);
  const src = post.cover_path ? publicUrl(post.cover_path) : null;

  return (
    <div className="mt-5 max-w-xl rounded-xl border border-black/10 p-4 dark:border-white/10">
      <h3 className={labelClass}>Cover image</h3>
      {src ? (
        <div className="mt-3 grid gap-3">
          <div className="relative h-40 w-full max-w-sm overflow-hidden rounded-lg">
            <Image src={src} alt="" fill sizes="384px" className="object-cover" />
          </div>
          <div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                if (!confirm("Remove this cover image? The uploaded file is deleted too.")) return;
                onRun(() => removeNewsCover(post.id), "Cover removed.");
              }}
            >
              <Trash2 className="h-4 w-4" /> Remove cover
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">No cover. The card renders without an image — never a stand-in.</p>
      )}

      <label className="mt-4 flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={coverConsent}
          onChange={(e) => setCoverConsent(e.target.checked)}
        />
        <span id={`news-cover-consent-${post.id}`}>
          I have permission to publish this photo, including from a parent or guardian for any minor
          who can be recognised in it.
        </span>
      </label>
      <div className="mt-3">
        <input
          ref={inputRef}
          type="file"
          aria-label={src ? "Replace cover image" : "Upload cover image"}
          aria-describedby={`news-cover-consent-${post.id}`}
          accept="image/jpeg,image/png,image/webp"
          className="block w-full min-w-0 text-sm disabled:opacity-50"
          disabled={pending || !coverConsent}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (inputRef.current) inputRef.current.value = "";
            if (file.size > MAX_PHOTO_BYTES) {
              onRun(async () => ({ error: "That photo is over 4MB. Resize or compress it, then upload again." }), "");
              return;
            }
            const fd = new FormData();
            fd.append("photo", file);
            fd.append("consent", "on");
            onRun(() => uploadNewsCover(post.id, fd), "Cover uploaded.", () => setCoverConsent(false));
          }}
        />
        <p className="mt-1 text-xs text-muted">JPEG, PNG or WebP, up to 4MB. Replacing deletes the old file.</p>
      </div>
    </div>
  );
}
