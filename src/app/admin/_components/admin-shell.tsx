import Link from "next/link";
import type { ReactNode } from "react";
import type { AdminContext } from "@/lib/rbac";
import { signOut } from "../login/actions";
import { Button } from "@/components/ui/button";
import { Breadcrumbs, type Crumb } from "@/components/ui/breadcrumbs";
import { cn } from "@/lib/utils";
import { AdminMobileNav } from "./admin-mobile-nav";
import { NAV_GROUPS, visibleNavItems, type Tab } from "./admin-nav";

export type { Tab };

/**
 * The chrome around every admin page.
 *
 * The public Navbar and Footer wrap admin routes too, and the root layout
 * already renders a <main>, so this deliberately uses a plain <div>: a second
 * <main> would be an accessibility violation, not just untidy markup.
 */
export function AdminShell({
  ctx,
  active,
  title,
  description,
  breadcrumbs,
  actions,
  children,
}: {
  ctx: AdminContext;
  active: Tab;
  title: string;
  /** One line under the title explaining what this screen is for. */
  description?: string;
  /** Defaults to Admin › <section> › <title>. Pass to override. */
  breadcrumbs?: Crumb[];
  /** Page-level buttons, rendered beside the title. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  const items = visibleNavItems(ctx.isPYH);
  const roleLabel = ctx.isPYH ? "Provincial Youth Head" : "Cluster Head";
  const section = items.find((i) => i.key === active);

  const crumbs: Crumb[] =
    breadcrumbs ??
    [
      { label: "Admin", href: "/admin" },
      ...(section && section.label !== title
        ? [{ label: section.label, href: section.href }]
        : []),
      { label: title },
    ];

  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-24 pt-28 sm:px-6 lg:px-8">
      <div className="lg:flex lg:gap-8">
        {/* ── Desktop sidebar. Hidden below lg, where AdminMobileNav takes over. ── */}
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-28">
            <p className="px-3 pb-4 text-xs font-semibold uppercase tracking-[0.18em] text-gold-700 dark:text-gold-300">
              {roleLabel}
            </p>
            <nav aria-label="Admin sections">
              {NAV_GROUPS.map((group) => {
                const groupItems = items.filter((i) => i.group === group);
                if (groupItems.length === 0) return null;
                return (
                  <div key={group} className="mb-6 last:mb-0">
                    <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                      {group}
                    </p>
                    <ul className="space-y-0.5">
                      {groupItems.map((item) => {
                        const isActive = item.key === active;
                        return (
                          <li key={item.key}>
                            <Link
                              href={item.href}
                              aria-current={isActive ? "page" : undefined}
                              className={cn(
                                "group relative flex items-center gap-3 rounded-xl py-2.5 pl-4 pr-3 text-sm font-semibold transition-colors",
                                isActive
                                  ? "bg-royal-50 text-royal-700 dark:bg-white/10 dark:text-gold-300"
                                  : "text-muted hover:bg-[var(--surface-2)] hover:text-[var(--fg)]",
                              )}
                            >
                              {/* The active indicator is a bar, not colour alone — colour
                                  is not the only channel carrying "you are here". */}
                              <span
                                aria-hidden="true"
                                className={cn(
                                  "absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full transition-colors",
                                  isActive ? "bg-royal-700 dark:bg-gold-400" : "bg-transparent",
                                )}
                              />
                              <item.icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
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
        </aside>

        {/* ── Page column ─────────────────────────────────────────── */}
        <div className="min-w-0 flex-1">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <Breadcrumbs items={crumbs} className="mb-2" />
              <h1 className="font-display text-3xl font-semibold text-[var(--fg)]">{title}</h1>
              {description && <p className="mt-1.5 max-w-2xl text-sm text-muted">{description}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {actions}
              <AdminMobileNav items={items} active={active} roleLabel={roleLabel} />
              <form action={signOut}>
                <Button variant="subtle" size="sm" type="submit">
                  Sign out
                </Button>
              </form>
            </div>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}
