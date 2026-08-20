"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createLeader, deleteLeader, updateLeader } from "../actions";

const field =
  "mt-1 w-full rounded-xl border border-black/10 bg-white/60 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5";
const label = "text-xs font-semibold uppercase tracking-wide text-muted";

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
  // there is personal content to gate: a quote (a photo is added in a later
  // slice). It records nothing itself — the server captures consent_at /
  // consent_by the moment a non-blank message is submitted — but it forces the
  // admin to see and accept what that means before the form will submit.
  const [message, setMessage] = useState(leader?.message ?? "");
  const needsConsent = message.trim().length > 0;

  return (
    <form action={(formData: FormData) => onSubmit(formData)} className="grid max-w-xl gap-4">
      <label className="block">
        <span className={label}>Name</span>
        <input name="name" required defaultValue={leader?.name} className={field} />
      </label>

      <label className="block">
        <span className={label}>Position</span>
        <input name="position" required defaultValue={leader?.position} className={field} />
        <span className="text-xs opacity-70">Free text — whatever title this person actually holds</span>
      </label>

      <label className="block">
        <span className={label}>Chapter</span>
        <select name="chapter_id" defaultValue={leader?.chapter_id ?? ""} className={field}>
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
        <span className={label}>Message / quote</span>
        <textarea
          name="message"
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className={field}
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
        <span className={label}>Facebook URL</span>
        <input name="facebook_url" type="url" defaultValue={leader?.facebook_url ?? ""} className={field} />
        <span className="text-xs opacity-70">Leave blank to withhold</span>
      </label>

      <label className="block">
        <span className={label}>Instagram URL</span>
        <input name="instagram_url" type="url" defaultValue={leader?.instagram_url ?? ""} className={field} />
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
