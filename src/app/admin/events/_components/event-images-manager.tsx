"use client";
import { fieldClass, labelClass } from "@/components/ui/field";
import Image from "next/image";
import { useEffect, useState, useTransition, type ChangeEvent, type FormEvent } from "react";
import { deleteEventImage, reorderEventImage, uploadEventImages } from "../actions";
import { ALLOWED_MIME, MAX_FILES } from "@/lib/images/validate";
import { uploadTooLarge } from "@/lib/images/upload-limit";

export type EventImageRow = { id: string; url: string; alt: string | null };

type Preview = { url: string; name: string };

export function EventImagesManager({
  eventId,
  images,
}: {
  eventId: string;
  images: EventImageRow[];
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Preview[]>([]);

  // Revoke the previous batch of object URLs whenever the preview list changes
  // (new selection or cleared after a successful upload), and on unmount.
  useEffect(() => {
    return () => {
      previews.forEach((p) => URL.revokeObjectURL(p.url));
    };
  }, [previews]);

  function handleFilesChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setPreviews(files.map((f) => ({ url: URL.createObjectURL(f), name: f.name })));
  }

  function handleUpload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const files = new FormData(form)
      .getAll("images")
      .filter((f): f is File => f instanceof File && f.size > 0);
    setError(null);
    if (files.length === 0) return setError("No files selected.");
    if (files.length > MAX_FILES) return setError(`At most ${MAX_FILES} images per upload.`);
    // Check every file before sending any, so a batch never half-uploads
    // because of a size the browser could have caught.
    const tooLarge = files.map(uploadTooLarge).find((m) => m !== null);
    if (tooLarge) return setError(tooLarge);

    // One file per request: a request is capped at 4.5MB on Vercel, so a
    // batch sent together failed as soon as two ordinary photos were picked.
    start(async () => {
      let sent = 0;
      for (const file of files) {
        const fd = new FormData();
        fd.append("images", file);
        const res = await uploadEventImages(eventId, fd);
        if (res.error) {
          setError(sent === 0 ? res.error : `${sent} of ${files.length} uploaded. ${res.error}`);
          // Keep the selection only when nothing went up; re-sending a
          // partly uploaded batch would duplicate the images already saved.
          if (sent > 0) {
            form.reset();
            setPreviews([]);
          }
          return;
        }
        sent++;
      }
      form.reset();
      setPreviews([]);
    });
  }

  function handleDelete(imageId: string) {
    setError(null);
    start(async () => {
      const res = await deleteEventImage(imageId);
      if (res.error) setError(res.error);
    });
  }

  function handleReorder(imageId: string, direction: "up" | "down") {
    setError(null);
    start(async () => {
      const res = await reorderEventImage(imageId, direction);
      if (res.error) setError(res.error);
    });
  }

  return (
    <div className="glass mt-6 grid max-w-2xl gap-4 rounded-2xl p-6">
      <h2 className={labelClass}>Event images</h2>

      <form onSubmit={handleUpload} className="grid gap-3">
        <label className="block">
          <span className={labelClass}>
            Upload images (up to {MAX_FILES}, 4MB max each)
          </span>
          <input
            type="file"
            name="images"
            multiple
            accept={ALLOWED_MIME.join(",")}
            onChange={handleFilesChange}
            className={fieldClass}
          />
        </label>

        {previews.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {previews.map((p) => (
              <div
                key={p.url}
                className="relative h-20 w-20 overflow-hidden rounded-xl border border-black/10 dark:border-white/10"
              >
                {/* Client-side blob preview: next/image cannot optimize blob: URLs. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.name} className="h-full w-full object-cover" />
              </div>
            ))}
          </div>
        )}

        {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}

        <div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-royal-500/15 px-3 py-1 text-xs font-semibold text-royal-600 disabled:opacity-40 dark:text-royal-300"
          >
            Upload
          </button>
        </div>
      </form>

      <div className="grid gap-3">
        {images.length === 0 ? (
          <p className="text-sm text-muted">No images yet.</p>
        ) : (
          images.map((img, idx) => (
            <div
              key={img.id}
              className="flex items-center gap-3 rounded-xl border border-black/5 p-2 dark:border-white/10"
            >
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg">
                <Image src={img.url} alt={img.alt ?? ""} fill sizes="64px" className="object-cover" />
              </div>
              <div className="flex flex-1 flex-wrap gap-2">
                <button
                  type="button"
                  aria-label="Move image up"
                  disabled={pending || idx === 0}
                  onClick={() => handleReorder(img.id, "up")}
                  className="rounded-full bg-royal-500/15 px-3 py-1 text-xs font-semibold text-royal-600 disabled:opacity-40 dark:text-royal-300"
                >
                  &#9650;
                </button>
                <button
                  type="button"
                  aria-label="Move image down"
                  disabled={pending || idx === images.length - 1}
                  onClick={() => handleReorder(img.id, "down")}
                  className="rounded-full bg-royal-500/15 px-3 py-1 text-xs font-semibold text-royal-600 disabled:opacity-40 dark:text-royal-300"
                >
                  &#9660;
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (confirm("Delete this image?")) handleDelete(img.id);
                  }}
                  className="rounded-full bg-rose-500/15 px-3 py-1 text-xs font-semibold text-rose-600 disabled:opacity-40"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
