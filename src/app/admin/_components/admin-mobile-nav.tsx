"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { NAV_GROUPS, NAV_ICONS, type NavItem, type Tab } from "./admin-nav";
import { cn } from "@/lib/utils";

/**
 * The admin navigation below `lg`.
 *
 * The drawer's links are mounted only while it is open, rather than kept in
 * the DOM and slid off-canvas. Two reasons, one of them non-obvious:
 *
 *  1. Off-canvas links stay focusable and stay in the accessibility tree, so a
 *     keyboard or screen-reader user tabs into a menu they cannot see.
 *  2. prove:editor asserts a PYH is offered *exactly one* link named "Pages".
 *     A second, permanently-mounted copy of the nav would make that count 2
 *     and fail the browser proof at its default 1280px viewport.
 *
 * The trigger deliberately avoids the `glass` class: prove:editor scopes the
 * page-editor section cards with `div.glass:has(button[aria-expanded])`, a CSS
 * locator that matches hidden elements too, so a glass-wrapped toggle here
 * would leak into that selector.
 */
export function AdminMobileNav({
  items,
  active,
  roleLabel,
}: {
  items: NavItem[];
  active: Tab;
  roleLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // Escape closes, Tab is trapped inside the panel, and focus returns to the
  // trigger on close so the keyboard user does not land back at the top.
  useEffect(() => {
    if (!open) return;

    const panel = panelRef.current;
    // Captured now, not read in cleanup: by the time cleanup runs the ref may
    // already point somewhere else, and this is the node we must return focus to.
    const trigger = triggerRef.current;
    panel?.querySelector<HTMLElement>("a, button")?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab" || !panel) return;

      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
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
      trigger?.focus();
    };
  }, [open, close]);

  return (
    <div className="lg:hidden">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="surface inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-[var(--fg)] transition-colors hover:bg-[var(--surface-2)]"
      >
        <Menu className="h-4 w-4" aria-hidden="true" />
        Menu
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={close}
            className="absolute inset-0 bg-midnight-950/60 backdrop-blur-sm"
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Admin navigation"
            className="relative ml-auto flex h-full w-[min(20rem,85vw)] flex-col overflow-y-auto bg-[var(--surface)] shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[var(--rule)] px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                {roleLabel}
              </p>
              <button
                type="button"
                onClick={close}
                aria-label="Close navigation"
                className="grid h-10 w-10 place-items-center rounded-xl text-muted transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <nav aria-label="Admin sections" className="flex-1 px-3 py-4">
              {NAV_GROUPS.map((group) => {
                const groupItems = items.filter((i) => i.group === group);
                if (groupItems.length === 0) return null;
                return (
                  <div key={group} className="mb-5 last:mb-0">
                    <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                      {group}
                    </p>
                    <ul className="space-y-1">
                      {groupItems.map((item) => {
                        const Icon = NAV_ICONS[item.key];
                        return (
                        <li key={item.key}>
                          <Link
                            href={item.href}
                            onClick={close}
                            aria-current={item.key === active ? "page" : undefined}
                            className={cn(
                              "flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors",
                              item.key === active
                                ? "bg-royal-50 text-royal-700 dark:bg-white/10 dark:text-gold-300"
                                : "text-muted hover:bg-[var(--surface-2)] hover:text-[var(--fg)]",
                            )}
                          >
                            <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                            {item.label}
                          </Link>
                        </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </nav>
          </div>
        </div>
      )}
    </div>
  );
}
