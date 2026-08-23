import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The opaque counterpart to the public site's `.glass`. Admin chrome is dense
 * and long-lived on screen, so it sits on solid ground: translucency over a
 * gradient makes measured text contrast unpredictable.
 */
export function Card({
  className,
  children,
  as: Tag = "div",
}: {
  className?: string;
  children: ReactNode;
  as?: "div" | "section" | "article";
}) {
  return (
    <Tag className={cn("surface rounded-2xl shadow-card", className)}>{children}</Tag>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 border-b border-[var(--rule)] px-5 py-4",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="font-display text-base font-semibold text-[var(--fg)]">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("p-5", className)}>{children}</div>;
}
