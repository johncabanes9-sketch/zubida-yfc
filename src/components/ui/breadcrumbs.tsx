import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Crumb {
  label: string;
  /** Omit on the final crumb — the current page is not a link. */
  href?: string;
}

/** `onDark` is for the public page header, which sits on midnight — there the
 *  page's own --fg/--muted tokens are the wrong ink entirely. */
export type CrumbTone = "default" | "onDark";

export function Breadcrumbs({
  items,
  tone = "default",
  className,
}: {
  items: Crumb[];
  tone?: CrumbTone;
  className?: string;
}) {
  if (items.length === 0) return null;
  const onDark = tone === "onDark";
  return (
    <nav aria-label="Breadcrumb" className={cn("min-w-0", className)}>
      <ol
        className={cn(
          "flex flex-wrap items-center gap-1 text-sm",
          onDark ? "text-cream/70" : "text-muted",
        )}
      >
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="flex items-center gap-1">
              {i > 0 && (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
              )}
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className={cn(
                    "rounded transition-colors",
                    onDark
                      ? "hover:text-gold-300"
                      : "hover:text-royal-700 dark:hover:text-gold-300",
                  )}
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className={cn("font-medium", onDark ? "text-cream" : "text-[var(--fg)]")}
                  aria-current={isLast ? "page" : undefined}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
