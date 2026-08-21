/**
 * Decides what happens to a leader's consent basis when their quote is saved.
 *
 * This rule is the one the Task 6 review called the worst defect found in the
 * slice, and until now nothing tested it: an admin who merely toggled
 * "Published" on someone else's leader silently became consent_by, with
 * consent_at moved to now -- naming a person who never obtained consent for
 * that quote. It lives here, as a pure function, so the proof suite can drive
 * every branch of it directly; the server action cannot be called without an
 * authenticated request context.
 *
 * The returned object is spread into the SAME update() that writes the
 * message. The leaders_personal_content_requires_consent CHECK rejects any
 * statement that sets a quote without a basis, so splitting them would let the
 * first land and violate the constraint on its own.
 */
export type ConsentPatch =
  | Record<string, never>
  | { consent_at: string; consent_by: string }
  | { consent_at: null; consent_by: null };

export function consentPatch(input: {
  /** The quote as submitted; null when the admin cleared it. */
  message: string | null;
  /** The quote already stored on the row. */
  currentMessage: string | null;
  /** The basis already recorded, if any. */
  currentConsentAt: string | null;
  /** Whether a photograph survives this save (it carries consent too). */
  currentPhotoPath: string | null;
  userId: string;
  now: string;
}): ConsentPatch {
  const { message, currentMessage, currentConsentAt, currentPhotoPath, userId, now } = input;

  if (message) {
    // An UNCHANGED quote keeps the basis originally recorded for it. A new or
    // edited quote is new personal content, so the basis is stamped fresh.
    return currentMessage === message && currentConsentAt
      ? {}
      : { consent_at: now, consent_by: userId };
  }

  // The quote is gone. If a photograph survives, the basis still describes it
  // and must stay. If nothing personal is left, clearing the basis is the only
  // honest outcome -- leaving it dangling names a person for content that no
  // longer exists.
  return currentPhotoPath ? {} : { consent_at: null, consent_by: null };
}
