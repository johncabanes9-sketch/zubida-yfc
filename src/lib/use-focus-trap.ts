"use client";

import { useEffect, type RefObject } from "react";

/** Everything a keyboard can land on. Mirrors the admin drawer's trap. */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Traps Tab inside `ref` while `active`, closes on Escape, locks body scroll,
 * and returns focus where it came from on close.
 *
 * Focus return uses the element that was focused when the trap engaged, rather
 * than a trigger ref: a dialog can be opened from more than one control (the
 * event card has both "View Details" and "Register"), and the right place to
 * send focus back is whichever one the user actually used.
 */
export function useFocusTrap(
  active: boolean,
  ref: RefObject<HTMLElement | null>,
  onEscape: () => void,
) {
  useEffect(() => {
    if (!active) return;

    const panel = ref.current;
    // Captured now, not read in cleanup: by then the document has moved on.
    const returnTo = document.activeElement as HTMLElement | null;
    panel?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onEscape();
        return;
      }
      if (e.key !== "Tab" || !panel) return;

      const focusable = panel.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      returnTo?.focus();
    };
  }, [active, ref, onEscape]);
}
