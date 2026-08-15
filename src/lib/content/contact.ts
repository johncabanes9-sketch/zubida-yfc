/**
 * Decides which contact channels the site is willing to publish.
 *
 * A blank phone or email is a deliberate withholding, not an oversight. Until
 * the provincial office confirms a number or an address, publishing a plausible
 * stand-in is worse than publishing nothing — the same rule the About page
 * follows for its unverified history (ZUBIDA_CONTENT_AUDIT.md §7.2).
 *
 * Withholding is decided here rather than at each call site so a new surface
 * cannot forget the rule and render an empty label or a `mailto:` link to
 * nothing — the reasoning behind ADR-5's trigger, applied to content.
 *
 * Note what this does *not* do: it never judges whether a non-blank value looks
 * like a placeholder. `+63 962 000 0000` is well-formed, and a heuristic strong
 * enough to reject it would also hide real numbers an administrator has just
 * entered. Withholding is the administrator's decision, expressed by clearing
 * the field; `prove:content` guards the constants and the seed against
 * reintroducing the known stand-ins.
 */

export type ContactDetails = { email: string; phone: string };

/** `null` means withheld — callers render nothing at all, not an empty row. */
export type PublishedContact = { email: string | null; phone: string | null };

const publishable = (value: string | null | undefined): string | null => {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
};

export function publishedContact(site: ContactDetails): PublishedContact {
  return { email: publishable(site.email), phone: publishable(site.phone) };
}
