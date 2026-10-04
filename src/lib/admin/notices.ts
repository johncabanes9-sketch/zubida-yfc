/**
 * Shown when an admin server action throws instead of resolving { error } —
 * most often an expired session (requirePYH / loadAdminContext throw). In
 * production Next redacts the thrown message, so there is nothing more
 * specific to show.
 */
export const ACTION_FAILED = "That didn't go through. Reload the page (sign in again if asked) and retry.";
