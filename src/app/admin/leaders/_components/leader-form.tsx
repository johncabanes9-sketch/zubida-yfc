"use client";
import { fieldClass, labelClass } from "@/components/ui/field";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { publicUrl } from "@/lib/images/paths";
import {
  createLeader,
  deleteLeader,
  removeLeaderPhoto,
  updateLeader,
  uploadLeaderPhoto,
  withdrawConsent,
} from "../actions";

/**
 * Largest photo the editor will send. Below validateImage's 5MB because the
 * request has to fit Vercel's 4.5MB function body cap with multipart overhead;
 * a larger body never reaches the action, and the dev server leaves the
 * request hanging instead of failing. Checked before anything is sent.
 */
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

type RunAction = (fn: () => Promise<{ error?: string }>, okText: string, onOk?: () => void) => void;

export type LeaderListItem = {
  id: string;
  name: string;
  position: string;
  chapter_id: string | null;
  cluster_id: string | null;
  message: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  is_published: boolean;
  photo_path: string | null;
  consent_at: string | null;
  chapter_name: string | null;
  cluster_name: string | null;
};

type Chapter = { id: string; name: string; cluster_id: string };

export function LeaderAdmin({
  isPYH,
  clusterId,
  leaders,
  chapters,
}: {
  isPYH: boolean;
  clusterId: string | null;
  leaders: LeaderListItem[];
  chapters: Chapter[];
}) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  /** Runs a server action and surfaces its error instead of failing silently. */
  const run: RunAction = (fn, okText, onOk) => {
    setNotice(null);
    start(async () => {
      // A server action can reject rather than return { error } — most often a
      // photo over the request body limit, which never reaches the action at
      // all. Without this the rejection escapes to the error boundary and the
      // admin sees the whole page fail instead of a notice.
      let res: { error?: string };
      try {
        res = await fn();
      } catch {
        res = { error: "That did not go through. If you were uploading a photo, try a smaller file." };
      }
      if (res.error) {
        setNotice({ kind: "error", text: res.error });
        return;
      }
      setNotice({ kind: "ok", text: okText });
      onOk?.();
    });
  };

  // A chapter-scoped row gets its cluster_id from the derivation trigger; a
  // cluster-scoped row carries the one it was inserted with. Either way it is
  // populated, so this comparison is meaningful — and a provincial-level row
  // (both null) never matches a non-null clusterId, so it stays PYH-only.
  const canEdit = (leader: LeaderListItem) => isPYH || clusterId === leader.cluster_id;
  const canCreate = isPYH || chapters.length > 0 || !!clusterId;

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
          <h2 className="font-display text-xl font-semibold">Add a leader</h2>
          <Button
            size="sm"
            disabled={!canCreate}
            onClick={() => {
              setEditingId(null);
              setNotice(null);
              setCreating((v) => !v);
            }}
          >
            <Plus className="h-4 w-4" /> {creating ? "Close" : "New leader"}
          </Button>
        </div>
        {!canCreate && (
          <p className="mt-3 text-sm text-muted">No cluster is assigned to you yet.</p>
        )}

        {creating && (
          <div className="mt-5 border-t border-black/5 pt-5 dark:border-white/10">
            <LeaderFields
              isPYH={isPYH}
              chapters={chapters}
              pending={pending}
              submitLabel="Create draft"
              onCancel={() => setCreating(false)}
              onSubmit={(formData) =>
                run(() => createLeader(formData), "Leader created as a draft.", () => setCreating(false))
              }
            />
          </div>
        )}
      </div>

      <div className="grid gap-3">
        {leaders.length === 0 ? (
          <p className="glass rounded-2xl p-10 text-center text-muted">
            No leaders yet. Add one above.
          </p>
        ) : (
          leaders.map((l) => (
            <div key={l.id} className="glass rounded-2xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 font-display text-lg font-semibold">
                    {l.name}
                    {!l.is_published && (
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                        Draft
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted">
                    {l.position} · {l.chapter_name ?? l.cluster_name ?? "Provincial"}
                  </p>
                </div>

                {canEdit(l) && (
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setCreating(false);
                        setNotice(null);
                        setEditingId(editingId === l.id ? null : l.id);
                      }}
                    >
                      {editingId === l.id ? "Close" : "Edit"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => {
                        if (!confirm(`Delete "${l.name}"? It will no longer appear on the site.`)) return;
                        run(() => deleteLeader(l.id), "Leader deleted.");
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                    </Button>
                  </div>
                )}
              </div>

              {editingId === l.id && (
                <div className="mt-5 border-t border-black/5 pt-5 dark:border-white/10">
                  <LeaderFields
                    isPYH={isPYH}
                    leader={l}
                    chapters={chapters}
                    pending={pending}
                    submitLabel="Save"
                    onCancel={() => setEditingId(null)}
                    onSubmit={(formData) =>
                      run(() => updateLeader(l.id, formData), "Leader saved.", () => setEditingId(null))
                    }
                  />
                  <PhotoField leader={l} pending={pending} onRun={run} />
                  <ConsentField leader={l} pending={pending} onRun={run} onWithdrawn={() => setEditingId(null)} />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function LeaderFields({
  isPYH,
  leader,
  chapters,
  pending,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  isPYH: boolean;
  leader?: LeaderListItem;
  chapters: Chapter[];
  pending: boolean;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (formData: FormData) => void;
}) {
  // The consent checkbox is a required client-side gate, shown only while
  // there is personal content to gate: a quote (PhotoField gates the photo the
  // same way). It records nothing itself — the server captures consent_at /
  // consent_by the moment a non-blank message is submitted — but it forces the
  // admin to see and accept what that means before the form will submit.
  const [message, setMessage] = useState(leader?.message ?? "");
  const needsConsent = message.trim().length > 0;

  return (
    <form action={(formData: FormData) => onSubmit(formData)} className="grid max-w-xl gap-4">
      <label className="block">
        <span className={labelClass}>Name</span>
        <input name="name" required defaultValue={leader?.name} className={fieldClass} />
      </label>

      <label className="block">
        <span className={labelClass}>Position</span>
        <input name="position" required defaultValue={leader?.position} className={fieldClass} />
        <span className="text-xs opacity-70">Free text — whatever title this person actually holds</span>
      </label>

      <label className="block">
        <span className={labelClass}>Chapter</span>
        <select name="chapter_id" defaultValue={leader?.chapter_id ?? ""} className={fieldClass}>
          <option value="">
            {isPYH ? "None — provincial level" : "None — cluster level"}
          </option>
          {chapters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <span className="text-xs opacity-70">Leave blank for a cluster- or provincial-level leader</span>
      </label>

      <label className="block">
        <span className={labelClass}>Message / quote</span>
        <textarea
          name="message"
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className={fieldClass}
        />
        <span className="text-xs opacity-70">Leave blank to withhold</span>
      </label>

      {needsConsent && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" required className="mt-0.5" />
          <span>
            I have recorded this person&apos;s consent to publish this quote under their name.
          </span>
        </label>
      )}

      <label className="block">
        <span className={labelClass}>Facebook URL</span>
        <input name="facebook_url" type="url" defaultValue={leader?.facebook_url ?? ""} className={fieldClass} />
        <span className="text-xs opacity-70">Leave blank to withhold</span>
      </label>

      <label className="block">
        <span className={labelClass}>Instagram URL</span>
        <input name="instagram_url" type="url" defaultValue={leader?.instagram_url ?? ""} className={fieldClass} />
        <span className="text-xs opacity-70">Leave blank to withhold</span>
      </label>

      {leader && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="is_published" defaultChecked={leader.is_published} />
          Published — visible on the public leaders page
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

/**
 * Photo control for an existing leader. Follows CoverField in chapter-form.tsx:
 * uploading replaces the current photo and reaps the old object; removing
 * deletes the object before clearing the reference. Unlike a chapter cover, a
 * photo of a person is personal content, so the file input stays disabled
 * until the admin confirms consent — the server stamps consent_at/consent_by
 * in the same statement that sets photo_path.
 */
function PhotoField({ leader, pending, onRun }: { leader: LeaderListItem; pending: boolean; onRun: RunAction }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [photoConsent, setPhotoConsent] = useState(false);
  const src = leader.photo_path ? publicUrl(leader.photo_path) : null;

  return (
    <div className="mt-5 max-w-xl rounded-xl border border-black/10 p-4 dark:border-white/10">
      <h3 className={labelClass}>Photo</h3>

      {src ? (
        <div className="mt-3 grid gap-3">
          <div className="relative h-40 w-32 overflow-hidden rounded-lg">
            <Image src={src} alt={`Photo of ${leader.name}`} fill sizes="128px" className="object-cover" />
          </div>
          <div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                if (!confirm(`Remove ${leader.name}'s photo? The uploaded file is deleted too.`)) return;
                onRun(() => removeLeaderPhoto(leader.id), "Photo removed.");
              }}
            >
              <Trash2 className="h-4 w-4" /> Remove photo
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">
          No photo. The public card renders without one — never a stand-in face.
        </p>
      )}

      <label className="mt-4 flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          id={`photo-consent-${leader.id}`}
          className="mt-0.5"
          checked={photoConsent}
          onChange={(e) => setPhotoConsent(e.target.checked)}
        />
        <span id={`photo-consent-${leader.id}-hint`}>
          I have recorded this person&apos;s consent to publish this photo of them.
        </span>
      </label>

      <div className="mt-3">
        <input
          ref={inputRef}
          type="file"
          aria-label={src ? "Replace photo" : "Upload photo"}
          aria-describedby={`photo-consent-${leader.id}-hint`}
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
            // Consent resets only once the photo it covered is saved; a failed
            // upload leaves it ticked for the retry.
            onRun(() => uploadLeaderPhoto(leader.id, fd), "Photo uploaded.", () => setPhotoConsent(false));
          }}
        />
        <p className="mt-1 text-xs text-muted">
          JPEG, PNG or WebP, up to 4MB. Uploading replaces the current photo and deletes the old file.
        </p>
      </div>
    </div>
  );
}

/**
 * Withdrawal of consent: deletes the photo file and clears the photo, the
 * quote and the consent record in one step. Offered only while consent is on
 * record — with nothing published under it there is nothing to withdraw. The
 * editor closes afterwards so its quote field, still holding the withdrawn
 * text, cannot be saved straight back.
 */
function ConsentField({
  leader,
  pending,
  onRun,
  onWithdrawn,
}: {
  leader: LeaderListItem;
  pending: boolean;
  onRun: RunAction;
  onWithdrawn: () => void;
}) {
  return (
    <div className="mt-5 max-w-xl rounded-xl border border-black/10 p-4 dark:border-white/10">
      <h3 className={labelClass}>Consent</h3>
      {leader.consent_at ? (
        <div className="mt-2 grid gap-3">
          <p className="text-sm text-muted">
            Consent recorded {new Date(leader.consent_at).toLocaleDateString("en-PH", { dateStyle: "medium" })}{" "}
            for {[leader.photo_path && "the photo", leader.message !== null && "the quote"].filter(Boolean).join(" and ")}.
          </p>
          <div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                if (!confirm(`Withdraw ${leader.name}'s consent? Their photo is deleted and their quote cleared.`)) return;
                onRun(() => withdrawConsent(leader.id), "Consent withdrawn. Photo and quote removed.", onWithdrawn);
              }}
            >
              <span className="text-rose-700 dark:text-rose-300">Withdraw consent</span>
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">No photo or quote is published, so no consent is on record.</p>
      )}
    </div>
  );
}
