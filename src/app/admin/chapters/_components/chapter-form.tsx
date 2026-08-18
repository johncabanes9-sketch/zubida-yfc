"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { publicUrl } from "@/lib/images/paths";
import {
  createChapter,
  deleteChapter,
  removeChapterCover,
  updateChapter,
  uploadChapterCover,
} from "../actions";

const field =
  "mt-1 w-full rounded-xl border border-black/10 bg-white/60 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5";
const label = "text-xs font-semibold uppercase tracking-wide text-muted";

export type ChapterListItem = {
  id: string;
  name: string;
  municipality: string;
  schedule: string | null;
  coordinator: string | null;
  is_published: boolean;
  cluster_id: string;
  cluster_name: string | null;
  cover_path: string | null;
};

type Cluster = { id: string; name: string };

export function ChapterAdmin({
  isPYH,
  clusterId,
  chapters,
  clusters,
}: {
  isPYH: boolean;
  clusterId: string | null;
  chapters: ChapterListItem[];
  clusters: Cluster[];
}) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  /** Runs a server action and surfaces its error instead of failing silently. */
  const run = (fn: () => Promise<{ error?: string }>, okText: string, onOk?: () => void) => {
    setNotice(null);
    start(async () => {
      const res = await fn();
      if (res.error) {
        setNotice({ kind: "error", text: res.error });
        return;
      }
      setNotice({ kind: "ok", text: okText });
      onOk?.();
    });
  };

  const canEdit = (chapter: ChapterListItem) => isPYH || clusterId === chapter.cluster_id;

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
          <h2 className="font-display text-xl font-semibold">Add a chapter</h2>
          <Button
            size="sm"
            disabled={clusters.length === 0}
            onClick={() => {
              setEditingId(null);
              setNotice(null);
              setCreating((v) => !v);
            }}
          >
            <Plus className="h-4 w-4" /> {creating ? "Close" : "New chapter"}
          </Button>
        </div>
        {clusters.length === 0 && (
          <p className="mt-3 text-sm text-muted">No cluster is assigned to you yet.</p>
        )}

        {creating && (
          <div className="mt-5 border-t border-black/5 pt-5 dark:border-white/10">
            <ChapterFields
              clusters={clusters}
              pending={pending}
              submitLabel="Create draft"
              onCancel={() => setCreating(false)}
              onSubmit={(formData) =>
                run(() => createChapter(formData), "Chapter created as a draft.", () => setCreating(false))
              }
            />
          </div>
        )}
      </div>

      <div className="grid gap-3">
        {chapters.length === 0 ? (
          <p className="glass rounded-2xl p-10 text-center text-muted">
            No chapters yet. Add one above.
          </p>
        ) : (
          chapters.map((c) => (
            <div key={c.id} className="glass rounded-2xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 font-display text-lg font-semibold">
                    {c.name}
                    {!c.is_published && (
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                        Draft
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted">
                    {c.municipality} · {c.cluster_name ?? "Unknown cluster"}
                  </p>
                </div>

                {canEdit(c) && (
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setCreating(false);
                        setNotice(null);
                        setEditingId(editingId === c.id ? null : c.id);
                      }}
                    >
                      {editingId === c.id ? "Close" : "Edit"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => {
                        if (!confirm(`Delete "${c.name}"? It will no longer appear on the site.`)) return;
                        run(() => deleteChapter(c.id), "Chapter deleted.");
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                    </Button>
                  </div>
                )}
              </div>

              {editingId === c.id && (
                <div className="mt-5 border-t border-black/5 pt-5 dark:border-white/10">
                  <ChapterFields
                    chapter={c}
                    pending={pending}
                    submitLabel="Save"
                    onCancel={() => setEditingId(null)}
                    onSubmit={(formData) =>
                      run(() => updateChapter(c.id, formData), "Chapter saved.", () => setEditingId(null))
                    }
                    onRun={run}
                  />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ChapterFields({
  chapter,
  clusters,
  pending,
  submitLabel,
  onCancel,
  onSubmit,
  onRun,
}: {
  chapter?: ChapterListItem;
  clusters?: Cluster[];
  pending: boolean;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (formData: FormData) => void;
  onRun?: (fn: () => Promise<{ error?: string }>, okText: string) => void;
}) {
  return (
    <form action={(formData: FormData) => onSubmit(formData)} className="grid max-w-xl gap-4">
      <label className="block">
        <span className={label}>Name</span>
        <input name="name" required defaultValue={chapter?.name} className={field} />
      </label>

      <label className="block">
        <span className={label}>Municipality</span>
        <input name="municipality" required defaultValue={chapter?.municipality} className={field} />
      </label>

      {chapter ? (
        <p className="text-xs text-muted">
          Cluster: <span className="font-medium">{chapter.cluster_name ?? "Unknown"}</span> (not editable here)
        </p>
      ) : (
        <label className="block">
          <span className={label}>Cluster</span>
          <select name="cluster_id" required defaultValue="" className={field}>
            <option value="" disabled>
              Choose a cluster
            </option>
            {(clusters ?? []).map((cl) => (
              <option key={cl.id} value={cl.id}>
                {cl.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="block">
        <span className={label}>Coordinator</span>
        <input name="coordinator" defaultValue={chapter?.coordinator ?? ""} className={field} />
        <span className="text-xs opacity-70">Leave blank to withhold</span>
      </label>

      <label className="block">
        <span className={label}>Meeting schedule</span>
        <input name="schedule" defaultValue={chapter?.schedule ?? ""} className={field} />
        <span className="text-xs opacity-70">Leave blank to withhold</span>
      </label>

      {chapter && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="is_published" defaultChecked={chapter.is_published} />
          Published — visible on the public chapters page
        </label>
      )}

      {chapter && onRun && (
        <CoverField chapterId={chapter.id} coverPath={chapter.cover_path} pending={pending} onRun={onRun} />
      )}

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

/**
 * Cover image control for an existing chapter. Follows ImageField in
 * page-editor.tsx: uploading replaces the current cover and reaps the old
 * object; removing deletes the object before clearing the reference. There
 * is no placeholder graphic — a chapter with no cover renders without one.
 */
function CoverField({
  chapterId,
  coverPath,
  pending,
  onRun,
}: {
  chapterId: string;
  coverPath: string | null;
  pending: boolean;
  onRun: (fn: () => Promise<{ error?: string }>, okText: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const src = coverPath ? publicUrl(coverPath) : null;

  return (
    <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
      <span className={label}>Cover image</span>

      {src ? (
        <div className="mt-3 grid gap-3">
          <div className="relative h-40 w-full max-w-sm overflow-hidden rounded-lg">
            <Image src={src} alt="" fill className="object-cover" />
          </div>
          <div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                if (!confirm("Remove this cover image? The uploaded file is deleted too.")) return;
                onRun(() => removeChapterCover(chapterId), "Cover image removed.");
              }}
            >
              <Trash2 className="h-4 w-4" /> Remove image
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">
          No cover image. The chapter card renders without one — better than a stand-in photo.
        </p>
      )}

      <div className="mt-4">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="text-sm"
          disabled={pending}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const fd = new FormData();
            fd.append("cover", file);
            onRun(() => uploadChapterCover(chapterId, fd), "Cover image uploaded.");
            if (inputRef.current) inputRef.current.value = "";
          }}
        />
        <p className="mt-1 text-xs text-muted">
          Uploading replaces the current cover and deletes the old file.
        </p>
      </div>
    </div>
  );
}
