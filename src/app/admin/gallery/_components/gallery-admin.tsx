"use client";
import { fieldClass, labelClass } from "@/components/ui/field";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { Eye, EyeOff, Pencil, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { publicUrl } from "@/lib/images/paths";
import {
  deleteGalleryPhoto,
  setGalleryPhotoPublished,
  updateGalleryPhoto,
  uploadGalleryPhoto,
} from "../actions";

export type GalleryListItem = {
  id: string;
  path: string;
  caption: string;
  category: string | null;
  width: number;
  height: number;
  cluster_id: string | null;
  cluster_name: string | null;
  is_published: boolean;
  consent_confirmed_at: string;
};

type Cluster = { id: string; name: string };
type RunAction = (fn: () => Promise<{ error?: string }>, okText: string, onOk?: () => void) => void;

/**
 * Largest photo the browser will send. Below validateImage's 5MB because the
 * request has to fit Vercel's 4.5MB function body cap with multipart overhead;
 * the same limit as the leader photo uploader.
 */
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

export function GalleryAdmin({
  isPYH,
  clusterId,
  photos,
  clusters,
  categories,
}: {
  isPYH: boolean;
  clusterId: string | null;
  photos: GalleryListItem[];
  clusters: Cluster[];
  categories: string[];
}) {
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  /** Runs a server action and surfaces its error instead of failing silently. */
  const run: RunAction = (fn, okText, onOk) => {
    setNotice(null);
    start(async () => {
      // A rejected action (e.g. a body over the request limit) must surface as
      // a notice, not take the page down.
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

  const canEdit = (p: GalleryListItem) => isPYH || (clusterId !== null && clusterId === p.cluster_id);
  const canUpload = isPYH || clusterId !== null;

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

      {canUpload ? (
        <UploadPanel
          isPYH={isPYH}
          clusters={clusters}
          categories={categories}
          pending={pending}
          run={run}
          setNotice={setNotice}
        />
      ) : (
        <p className="glass rounded-2xl p-6 text-sm text-muted">No cluster is assigned to you yet.</p>
      )}

      <datalist id="gallery-categories">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {photos.length === 0 ? (
        <p className="glass rounded-2xl p-10 text-center text-muted">
          No photos yet. Upload one above.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Gallery photos">
          {photos.map((p) => (
            <li key={p.id} className="glass flex flex-col overflow-hidden rounded-2xl">
              <div className="relative aspect-[4/3] bg-black/5 dark:bg-white/5">
                <Image
                  src={publicUrl(p.path)}
                  alt={p.caption}
                  fill
                  sizes="(max-width:640px) 100vw, (max-width:1024px) 50vw, 33vw"
                  className="object-cover"
                />
                {!p.is_published && (
                  <span className="absolute left-3 top-3 rounded-full bg-amber-500/90 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-white">
                    Draft
                  </span>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-2 p-4">
                <p className="text-sm font-medium">{p.caption}</p>
                <p className="text-xs text-muted">
                  {[p.category, p.cluster_name ?? "Provincial", `${p.width}×${p.height}`].filter(Boolean).join(" · ")}
                </p>

                {canEdit(p) && editingId !== p.id && (
                  <div className="mt-auto flex flex-wrap gap-1 pt-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() =>
                        run(
                          () => setGalleryPhotoPublished(p.id, !p.is_published),
                          p.is_published ? "Photo unpublished." : "Photo published.",
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
                      aria-label={`Delete photo: ${p.caption}`}
                      onClick={() => {
                        if (!confirm(`Delete "${p.caption}"? The uploaded file is deleted too.`)) return;
                        run(() => deleteGalleryPhoto(p.id), "Photo deleted.");
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                    </Button>
                  </div>
                )}

                {editingId === p.id && (
                  <EditForm
                    photo={p}
                    pending={pending}
                    onCancel={() => setEditingId(null)}
                    onSubmit={(fd) => run(() => updateGalleryPhoto(p.id, fd), "Photo saved.", () => setEditingId(null))}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function UploadPanel({
  isPYH,
  clusters,
  categories,
  pending,
  run,
  setNotice,
}: {
  isPYH: boolean;
  clusters: Cluster[];
  categories: string[];
  pending: boolean;
  run: RunAction;
  setNotice: (n: { kind: "ok" | "error"; text: string } | null) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [consent, setConsent] = useState(false);

  return (
    <form
      ref={formRef}
      className="glass grid gap-4 rounded-2xl p-6"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const file = form.get("photo");
        if (!(file instanceof File) || file.size === 0) {
          setNotice({ kind: "error", text: "Choose a photo first." });
          return;
        }
        if (file.size > MAX_PHOTO_BYTES) {
          setNotice({ kind: "error", text: "That photo is over 4MB. Resize or compress it, then upload again." });
          return;
        }
        const fd = new FormData();
        fd.append("photo", file);
        fd.append("caption", String(form.get("caption") ?? ""));
        fd.append("category", String(form.get("category") ?? ""));
        fd.append("cluster_id", String(form.get("cluster_id") ?? ""));
        fd.append("consent", consent ? "on" : "");
        run(() => uploadGalleryPhoto(fd), "Photo uploaded as a draft.", () => {
          formRef.current?.reset();
          setConsent(false);
        });
      }}
    >
      <h2 className="font-display text-xl font-semibold">Upload a photo</h2>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className={labelClass}>Photo</span>
          <input
            name="photo"
            type="file"
            required
            accept="image/jpeg,image/png,image/webp"
            className="mt-1.5 block w-full min-w-0 text-sm"
          />
          <span className="text-xs opacity-70">JPEG, PNG or WebP, up to 4MB.</span>
        </label>

        <label className="block">
          <span className={labelClass}>Caption</span>
          <input name="caption" required maxLength={300} className={fieldClass} />
          <span className="text-xs opacity-70">Describe what is happening — it is also the alt text.</span>
        </label>

        <label className="block">
          <span className={labelClass}>Category</span>
          <input name="category" maxLength={60} list="gallery-categories" className={fieldClass} />
          <span className="text-xs opacity-70">
            {categories.length > 0 ? "Pick an existing one or type a new one." : "Optional, e.g. the event or program."}
          </span>
        </label>

        {isPYH && (
          <label className="block">
            <span className={labelClass}>Cluster</span>
            <select name="cluster_id" defaultValue="" className={fieldClass}>
              <option value="">None — provincial level</option>
              {clusters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        <span id="gallery-consent-hint">
          I have permission to publish this photo, including from a parent or guardian for any
          minor who can be recognised in it.
        </span>
      </label>

      <div>
        <Button type="submit" size="sm" disabled={pending || !consent} aria-describedby="gallery-consent-hint">
          <Upload className="h-4 w-4" /> Upload photo
        </Button>
      </div>
    </form>
  );
}

function EditForm({
  photo,
  pending,
  onCancel,
  onSubmit,
}: {
  photo: GalleryListItem;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (fd: FormData) => void;
}) {
  return (
    <form action={(fd: FormData) => onSubmit(fd)} className="mt-2 grid gap-3">
      <label className="block">
        <span className={labelClass}>Caption</span>
        <input name="caption" required maxLength={300} defaultValue={photo.caption} className={fieldClass} />
      </label>
      <label className="block">
        <span className={labelClass}>Category</span>
        <input
          name="category"
          maxLength={60}
          list="gallery-categories"
          defaultValue={photo.category ?? ""}
          className={fieldClass}
        />
      </label>
      {/* Publishing is the card's own toggle, not a field here: a second copy of
          that state in this form went stale and silently unpublished photos. */}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          Save
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
