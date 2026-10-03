"use client";
import { fieldClass, labelClass } from "@/components/ui/field";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { publicUrl } from "@/lib/images/paths";
import {
  createTestimonial,
  deleteTestimonial,
  removeTestimonialPhoto,
  setTestimonialPublished,
  updateTestimonial,
  uploadTestimonialPhoto,
} from "../actions";

export type TestimonialListItem = {
  id: string;
  name: string;
  role: string | null;
  quote: string;
  photo_path: string | null;
  chapter_id: string | null;
  is_published: boolean;
  consent_at: string;
};

type Chapter = { id: string; name: string };
type RunAction = (fn: () => Promise<{ error?: string }>, okText: string, onOk?: () => void) => void;

/** Same browser-side cap as the other photo uploaders (Vercel's 4.5MB body limit). */
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

export function TestimonialsAdmin({ testimonials, chapters }: { testimonials: TestimonialListItem[]; chapters: Chapter[] }) {
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const chapterName = (id: string | null) => chapters.find((c) => c.id === id)?.name ?? null;

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
          <h2 className="font-display text-xl font-semibold">Add a testimonial</h2>
          <Button
            size="sm"
            onClick={() => {
              setEditingId(null);
              setNotice(null);
              setCreating((v) => !v);
            }}
          >
            <Plus className="h-4 w-4" /> {creating ? "Close" : "New testimonial"}
          </Button>
        </div>
        {creating && (
          <div className="mt-5 border-t border-black/5 pt-5 dark:border-white/10">
            <Fields
              chapters={chapters}
              pending={pending}
              submitLabel="Create draft"
              onCancel={() => setCreating(false)}
              onSubmit={(fd) => run(() => createTestimonial(fd), "Testimonial created as a draft.", () => setCreating(false))}
            />
          </div>
        )}
      </div>

      {testimonials.length === 0 ? (
        <p className="glass rounded-2xl p-10 text-center text-muted">No testimonials yet. Add one above.</p>
      ) : (
        <ul className="grid gap-3" aria-label="Testimonials">
          {testimonials.map((t) => (
            <li key={t.id} className="glass rounded-2xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 max-w-2xl">
                  <p className="flex flex-wrap items-center gap-2 font-display text-lg font-semibold">
                    <span className="break-words">{t.name}</span>
                    {!t.is_published && (
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                        Draft
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted">
                    {[t.role, chapterName(t.chapter_id), `consent recorded ${t.consent_at.slice(0, 10)}`].filter(Boolean).join(" · ")}
                  </p>
                  <p className="mt-2 break-words text-sm">“{t.quote}”</p>
                </div>

                {editingId !== t.id && (
                  <div className="flex flex-wrap gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() =>
                        run(
                          () => setTestimonialPublished(t.id, !t.is_published),
                          t.is_published ? "Testimonial unpublished." : "Testimonial published.",
                        )
                      }
                    >
                      {t.is_published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      {t.is_published ? "Unpublish" : "Publish"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setCreating(false);
                        setNotice(null);
                        setEditingId(t.id);
                      }}
                    >
                      <Pencil className="h-4 w-4" /> Edit
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      aria-label={`Delete testimonial from ${t.name}`}
                      onClick={() => {
                        if (!confirm(`Delete ${t.name}'s testimonial? Their name, words and photo are erased.`)) return;
                        run(() => deleteTestimonial(t.id), "Testimonial deleted and erased.");
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                    </Button>
                  </div>
                )}
              </div>

              {editingId === t.id && (
                <div className="mt-5 border-t border-black/5 pt-5 dark:border-white/10">
                  <Fields
                    testimonial={t}
                    chapters={chapters}
                    pending={pending}
                    submitLabel="Save"
                    onCancel={() => setEditingId(null)}
                    onSubmit={(fd) => run(() => updateTestimonial(t.id, fd), "Testimonial saved.", () => setEditingId(null))}
                  />
                  <PhotoField testimonial={t} pending={pending} onRun={run} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Fields({
  testimonial,
  chapters,
  pending,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  testimonial?: TestimonialListItem;
  chapters: Chapter[];
  pending: boolean;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (fd: FormData) => void;
}) {
  // The consent tick is required for a new testimonial, and again whenever the
  // words change — the server enforces both; this makes the admin see it.
  const [quote, setQuote] = useState(testimonial?.quote ?? "");
  const [name, setName] = useState(testimonial?.name ?? "");
  const needsConsent =
    !testimonial || quote.trim() !== testimonial.quote.trim() || name.trim() !== testimonial.name.trim();

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
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={labelClass}>Name</span>
          <input
            name="name"
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Role</span>
          <input name="role" maxLength={120} defaultValue={testimonial?.role ?? ""} className={fieldClass} />
          <span className="text-xs opacity-70">e.g. Chapter member. Leave blank to withhold.</span>
        </label>
      </div>
      <label className="block">
        <span className={labelClass}>Chapter</span>
        <select name="chapter_id" defaultValue={testimonial?.chapter_id ?? ""} className={fieldClass}>
          <option value="">None</option>
          {chapters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className={labelClass}>Their words</span>
        <textarea
          name="quote"
          required
          rows={4}
          maxLength={600}
          value={quote}
          onChange={(e) => setQuote(e.target.value)}
          className={fieldClass}
        />
        <span className="text-xs opacity-70">Exactly as they said or approved it.</span>
      </label>
      {needsConsent && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="consent" required className="mt-0.5" />
          <span>
            I have this person&apos;s consent to publish {testimonial ? "these words, as changed," : "these words"} under
            their name{" "}
            (a parent or guardian&apos;s too, if they are a minor).
          </span>
        </label>
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

function PhotoField({ testimonial, pending, onRun }: { testimonial: TestimonialListItem; pending: boolean; onRun: RunAction }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [photoConsent, setPhotoConsent] = useState(false);
  const src = testimonial.photo_path ? publicUrl(testimonial.photo_path) : null;

  return (
    <div className="mt-5 max-w-xl rounded-xl border border-black/10 p-4 dark:border-white/10">
      <h3 className={labelClass}>Photo</h3>
      {src ? (
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <div className="relative h-20 w-20 overflow-hidden rounded-full">
            <Image src={src} alt={`Photo of ${testimonial.name}`} fill sizes="80px" className="object-cover" />
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              if (!confirm(`Remove ${testimonial.name}'s photo? The uploaded file is deleted too.`)) return;
              onRun(() => removeTestimonialPhoto(testimonial.id), "Photo removed.");
            }}
          >
            <Trash2 className="h-4 w-4" /> Remove photo
          </Button>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">No photo. The testimonial shows without one — never a stand-in face.</p>
      )}
      <label className="mt-4 flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5" checked={photoConsent} onChange={(e) => setPhotoConsent(e.target.checked)} />
        <span id={`testimonial-photo-consent-${testimonial.id}`}>
          I have this person&apos;s consent to publish their photo (a parent or guardian&apos;s too, if they are a minor).
        </span>
      </label>
      <div className="mt-3">
        <input
          ref={inputRef}
          type="file"
          aria-label={src ? "Replace photo" : "Upload photo"}
          aria-describedby={`testimonial-photo-consent-${testimonial.id}`}
          accept="image/jpeg,image/png,image/webp"
          className="block w-full min-w-0 text-sm disabled:opacity-50"
          disabled={pending || !photoConsent}
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
            onRun(() => uploadTestimonialPhoto(testimonial.id, fd), "Photo uploaded.", () => setPhotoConsent(false));
          }}
        />
        <p className="mt-1 text-xs text-muted">JPEG, PNG or WebP, up to 4MB. Replacing deletes the old file.</p>
      </div>
    </div>
  );
}
