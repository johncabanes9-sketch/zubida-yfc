/** TikTok's glyph, drawn locally because lucide-react ships no TikTok icon —
 *  its brand set stops at Facebook, Instagram, Twitter and Youtube. The props
 *  and the `currentColor` fill match how the lucide icons are used beside it in
 *  the footer, so it inherits the same sizing and hover colour with no special
 *  casing at the call site. */
export function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M16.5 3c.4 1.9 1.5 3.2 3.5 3.4v2.3c-1.2.1-2.4-.2-3.5-.9v5.6c0 4-3.3 6.6-6.7 5.5-2.6-.8-4-3.5-3.4-6.1.5-2.2 2.4-3.8 4.7-3.9.4 0 .7 0 1.1.1v2.4c-1.4-.3-2.6.4-3 1.5-.4 1.1.1 2.4 1.2 2.9 1.3.6 2.9-.2 3.2-1.6.1-.3.1-.6.1-.9V3h2.8z" />
    </svg>
  );
}
