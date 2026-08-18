/**
 * Publication gate for Phase-1 demo fixtures.
 *
 * `src/data/*.ts` was authored during the Phase-1 visual showcase and is populated
 * with invented content: leader names and stock-photo faces, chapter rosters,
 * member counts, news articles, testimonial quotes, and a founding history. None
 * of it is traceable to Zubida YFC (see ZUBIDA_CONTENT_AUDIT.md §2).
 *
 * The data is kept in the repository — it defines the shape each page expects and
 * is the reference for what a real dataset must supply — but it must not be
 * published as fact. Each domain below stays `false` until an authorized
 * administrator supplies verified content, at which point the domain should move
 * to a managed table rather than having this flag flipped.
 *
 * Do not set any of these to `true` to make a page "look finished".
 */
export type FixtureDomain =
  | "news"
  | "gallery"
  | "testimonials"
  | "aboutHistory"
  | "photography";

const VERIFIED: Record<FixtureDomain, boolean> = {
  /** src/data/news.ts — 6 invented articles attributed to named authors. */
  news: false,
  /** src/data/gallery.ts — 18 picsum.photos images with captions asserting real events. */
  gallery: false,
  /** src/data/stats.ts testimonials — 4 invented quotes attributed to named people. */
  testimonials: false,
  /** About timeline — 6 dated historical milestones, founding year unsourced. */
  aboutHistory: false,
  /** Decorative photography across hero/about-teaser — all picsum.photos stock. */
  photography: false,
};

/** True only when a domain's content has been confirmed by the organization. */
export function isVerified(domain: FixtureDomain): boolean {
  return VERIFIED[domain];
}
