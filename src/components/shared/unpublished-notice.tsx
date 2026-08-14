import { FileQuestion } from "lucide-react";

/**
 * Shown in place of a section whose content has not been confirmed by the
 * organization yet. It says plainly that nothing is published — it never
 * stands in for the missing content with sample or illustrative material.
 */
export function UnpublishedNotice({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <div className="glass flex flex-col items-center justify-center rounded-3xl px-6 py-20 text-center">
      <FileQuestion className="h-12 w-12 text-muted" />
      <p className="mt-4 font-display text-xl">{title}</p>
      <p className="mt-2 max-w-md text-sm text-muted">{detail}</p>
    </div>
  );
}
