"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { ChevronDown, Eye, EyeOff, MoveDown, MoveUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EditorField } from "@/lib/pages/registry";
import {
  addSection,
  deleteSection,
  removeSectionImage,
  reorderSection,
  toggleSectionVisible,
  updatePageSeo,
  updateSectionContent,
  uploadSectionImage,
} from "../actions";

const field =
  "mt-1 w-full rounded-xl border border-black/10 bg-white/60 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5";
const label = "text-xs font-semibold uppercase tracking-wide text-muted";

export type EditorSection = {
  id: string;
  type: string;
  label: string;
  content: unknown;
  visible: boolean;
  fields: EditorField[];
};

type Draft = Record<string, unknown>;

export function PageEditor({
  pageId,
  seoTitle,
  seoDescription,
  sections,
  addable,
  iconNames,
}: {
  pageId: string;
  seoTitle: string;
  seoDescription: string;
  sections: EditorSection[];
  addable: { type: string; label: string }[];
  iconNames: string[];
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [newType, setNewType] = useState(addable[0]?.type ?? "");
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  /** Runs a server action and surfaces its error instead of failing silently. */
  const run = (fn: () => Promise<{ error?: string }>, okText: string) => {
    setNotice(null);
    start(async () => {
      const res = await fn();
      setNotice(res.error ? { kind: "error", text: res.error } : { kind: "ok", text: okText });
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

      {/* ── SEO ── */}
      <form
        action={async (formData: FormData) => {
          const res = await updatePageSeo(pageId, formData);
          setNotice(
            res.error ? { kind: "error", text: res.error } : { kind: "ok", text: "SEO saved." },
          );
        }}
        className="glass grid max-w-2xl gap-4 rounded-2xl p-6"
      >
        <h2 className="font-display text-xl font-semibold">Search &amp; sharing</h2>
        <label className="block">
          <span className={label}>SEO title</span>
          <input name="seo_title" defaultValue={seoTitle} maxLength={200} className={field} />
        </label>
        <label className="block">
          <span className={label}>SEO description</span>
          <textarea
            name="seo_description"
            rows={2}
            defaultValue={seoDescription}
            maxLength={400}
            className={field}
          />
        </label>
        <div>
          <Button type="submit" size="sm">Save SEO</Button>
        </div>
      </form>

      {/* ── Add a section ── */}
      <div className="glass flex flex-wrap items-end gap-3 rounded-2xl p-6">
        <label className="block">
          <span className={label}>Add a section</span>
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            className={field}
          >
            {addable.map((a) => (
              <option key={a.type} value={a.type}>{a.label}</option>
            ))}
          </select>
        </label>
        <Button
          size="sm"
          disabled={pending || !newType}
          onClick={() => run(() => addSection(pageId, newType), "Section added.")}
        >
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>

      {/* ── Sections ── */}
      <div className="grid gap-3">
        {sections.length === 0 && (
          <p className="glass rounded-2xl p-10 text-center text-muted">
            No sections yet. Add one above.
          </p>
        )}
        {sections.map((s, i) => (
          <div key={s.id} className="glass rounded-2xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                onClick={() => setOpen(open === s.id ? null : s.id)}
                className="flex items-center gap-2 text-left"
                aria-expanded={open === s.id}
              >
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${open === s.id ? "rotate-180" : ""}`}
                />
                <span className="font-display text-lg font-semibold">{s.label}</span>
                {!s.visible && (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                    Hidden
                  </span>
                )}
              </button>

              <div className="flex gap-1">
                <IconButton
                  title="Move up"
                  disabled={pending || i === 0}
                  onClick={() => run(() => reorderSection(s.id, "up"), "Section moved.")}
                >
                  <MoveUp className="h-4 w-4" />
                </IconButton>
                <IconButton
                  title="Move down"
                  disabled={pending || i === sections.length - 1}
                  onClick={() => run(() => reorderSection(s.id, "down"), "Section moved.")}
                >
                  <MoveDown className="h-4 w-4" />
                </IconButton>
                <IconButton
                  title={s.visible ? "Hide from the public page" : "Show on the public page"}
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => toggleSectionVisible(s.id),
                      s.visible ? "Section hidden." : "Section shown.",
                    )
                  }
                >
                  {s.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </IconButton>
                <IconButton
                  title="Delete section"
                  disabled={pending}
                  onClick={() => {
                    if (!confirm(`Delete the "${s.label}" section? This cannot be undone.`)) return;
                    run(() => deleteSection(s.id), "Section deleted.");
                  }}
                >
                  <Trash2 className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                </IconButton>
              </div>
            </div>

            {open === s.id && (
              <div className="mt-5 border-t border-black/5 pt-5 dark:border-white/10">
                <SectionForm
                  section={s}
                  iconNames={iconNames}
                  pending={pending}
                  onRun={run}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function IconButton({
  title,
  disabled,
  onClick,
  children,
}: {
  title: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className="grid h-9 w-9 place-items-center rounded-lg border border-black/10 transition-colors hover:bg-black/5 disabled:opacity-40 dark:border-white/15 dark:hover:bg-white/10"
    >
      {children}
    </button>
  );
}

function SectionForm({
  section,
  iconNames,
  pending,
  onRun,
}: {
  section: EditorSection;
  iconNames: string[];
  pending: boolean;
  onRun: (fn: () => Promise<{ error?: string }>, okText: string) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => ({ ...(section.content as Draft) }));

  const set = (key: string, value: unknown) => setDraft((d) => ({ ...d, [key]: value }));

  return (
    <div className="grid gap-4">
      {section.fields.map((f) => (
        <FieldInput
          key={f.key}
          field={f}
          value={draft[f.key]}
          onChange={(v) => set(f.key, v)}
          iconNames={iconNames}
          sectionId={section.id}
          pending={pending}
          onRun={onRun}
        />
      ))}
      <div>
        <Button
          size="sm"
          disabled={pending}
          onClick={() => onRun(() => updateSectionContent(section.id, draft), "Section saved.")}
        >
          Save section
        </Button>
      </div>
    </div>
  );
}

function FieldInput({
  field: f,
  value,
  onChange,
  iconNames,
  sectionId,
  pending,
  onRun,
}: {
  field: EditorField;
  value: unknown;
  onChange: (v: unknown) => void;
  iconNames: string[];
  sectionId: string;
  pending: boolean;
  onRun: (fn: () => Promise<{ error?: string }>, okText: string) => void;
}) {
  if (f.kind === "text") {
    return (
      <label className="block">
        <span className={label}>{f.label}</span>
        <input
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          className={field}
        />
      </label>
    );
  }

  if (f.kind === "textarea") {
    return (
      <label className="block">
        <span className={label}>
          {f.label}
          {f.optional && <span className="ml-1 font-normal normal-case">(optional)</span>}
        </span>
        <textarea
          rows={3}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          className={field}
        />
      </label>
    );
  }

  if (f.kind === "select" || f.kind === "icon") {
    const options = f.kind === "icon" ? iconNames : f.options;
    return (
      <label className="block">
        <span className={label}>{f.label}</span>
        <select
          value={String(value ?? options[0] ?? "")}
          onChange={(e) => onChange(e.target.value)}
          className={field}
        >
          {options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </label>
    );
  }

  if (f.kind === "image") {
    return (
      <ImageField
        fieldKey={f.key}
        fieldLabel={f.label}
        value={value as ImageValue | null | undefined}
        onChange={onChange}
        sectionId={sectionId}
        pending={pending}
        onRun={onRun}
      />
    );
  }

  if (f.kind !== "list") return null;

  const items = Array.isArray(value) ? (value as Draft[]) : [];
  const replace = (next: Draft[]) => onChange(next);

  return (
    <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
      <div className="flex items-center justify-between">
        <span className={label}>{f.label}</span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            replace([
              ...items,
              Object.fromEntries(
                f.itemFields.map((itf) => [itf.key, itf.kind === "icon" ? iconNames[0] : ""]),
              ) as Draft,
            ])
          }
        >
          <Plus className="h-4 w-4" /> Add item
        </Button>
      </div>

      <div className="mt-3 grid gap-3">
        {items.length === 0 && (
          <p className="text-sm text-muted">No items. Add one above.</p>
        )}
        {items.map((item, idx) => (
          <div key={idx} className="rounded-lg bg-black/[0.03] p-3 dark:bg-white/5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-muted">#{idx + 1}</span>
              <div className="flex gap-1">
                <IconButton
                  title="Move item up"
                  disabled={idx === 0}
                  onClick={() => {
                    const next = [...items];
                    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                    replace(next);
                  }}
                >
                  <MoveUp className="h-3.5 w-3.5" />
                </IconButton>
                <IconButton
                  title="Move item down"
                  disabled={idx === items.length - 1}
                  onClick={() => {
                    const next = [...items];
                    [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
                    replace(next);
                  }}
                >
                  <MoveDown className="h-3.5 w-3.5" />
                </IconButton>
                <IconButton
                  title="Remove item"
                  onClick={() => replace(items.filter((_, j) => j !== idx))}
                >
                  <Trash2 className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
                </IconButton>
              </div>
            </div>
            <div className="grid gap-3">
              {f.itemFields.map((itf) => (
                <FieldInput
                  key={itf.key}
                  field={itf}
                  value={item[itf.key]}
                  onChange={(v) =>
                    replace(items.map((it, j) => (j === idx ? { ...it, [itf.key]: v } : it)))
                  }
                  iconNames={iconNames}
                  sectionId={sectionId}
                  pending={pending}
                  onRun={onRun}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type ImageValue = { src: string; alt: string; width: number; height: number; objectPath: string | null };

function ImageField({
  fieldKey,
  fieldLabel,
  value,
  onChange,
  sectionId,
  pending,
  onRun,
}: {
  fieldKey: string;
  fieldLabel: string;
  value: ImageValue | null | undefined;
  onChange: (v: unknown) => void;
  sectionId: string;
  pending: boolean;
  onRun: (fn: () => Promise<{ error?: string }>, okText: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
      <span className={label}>{fieldLabel}</span>

      {value ? (
        <div className="mt-3 grid gap-3">
          <div className="relative h-40 w-full max-w-sm overflow-hidden rounded-lg">
            <Image src={value.src} alt={value.alt || ""} fill className="object-cover" />
          </div>
          <label className="block">
            <span className={label}>Alt text</span>
            <input
              value={value.alt ?? ""}
              onChange={(e) => onChange({ ...value, alt: e.target.value })}
              placeholder="Describe what the photo shows"
              className={field}
            />
            <span className="mt-1 block text-xs text-muted">
              Read aloud by screen readers. Describe the actual photo — save the
              section after editing.
            </span>
          </label>
          <div>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                if (!confirm("Remove this image? The uploaded file is deleted too.")) return;
                onRun(() => removeSectionImage(sectionId, fieldKey), "Image removed.");
              }}
            >
              <Trash2 className="h-4 w-4" /> Remove image
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">
          No image. This section renders text-only — better than a stand-in photo.
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
            fd.append("image", file);
            onRun(() => uploadSectionImage(sectionId, fieldKey, fd), "Image uploaded.");
            if (inputRef.current) inputRef.current.value = "";
          }}
        />
        <p className="mt-1 text-xs text-muted">
          Uploading replaces the current image and deletes the old file.
        </p>
      </div>
    </div>
  );
}
