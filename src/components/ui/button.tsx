import Link from "next/link";
import { cn } from "@/lib/utils";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "gold" | "outline" | "ghost" | "subtle" | "danger";
type Size = "xs" | "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-300 focus-visible:outline-none disabled:opacity-60 disabled:pointer-events-none";

const variants: Record<Variant, string> = {
  primary:
    "bg-dawn-soft text-white shadow-soft hover:shadow-glow hover:-translate-y-0.5",
  gold: "bg-gold-500 text-midnight-900 shadow-soft hover:bg-gold-400 hover:-translate-y-0.5",
  outline:
    "border border-royal-700/30 text-royal-700 dark:border-gold-400/40 dark:text-gold-300 hover:bg-royal-700/5 dark:hover:bg-gold-400/10",
  ghost: "text-current hover:bg-royal-700/5 dark:hover:bg-white/5",
  // Low-emphasis filled button for dense admin rows, where an outline on every
  // action turns the table into a grid of boxes.
  subtle:
    "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-white/10 dark:text-neutral-300 dark:hover:bg-white/15",
  // Destructive actions were previously hand-rolled inline classes at each call
  // site; this is the one definition, and it meets AA in both themes.
  danger:
    "bg-danger-50 text-danger-700 hover:bg-danger-500 hover:text-white dark:bg-danger-300/15 dark:text-danger-300 dark:hover:bg-danger-500 dark:hover:text-white",
};

const sizes: Record<Size, string> = {
  // `xs` is for in-row table actions only. It is below the 44px touch target,
  // so it must not be the sole way to perform an action on a small screen —
  // DataTable's stacked card layout gives those actions their own full-width row.
  xs: "px-3 py-1.5 text-xs",
  sm: "px-4 py-2 text-sm",
  md: "px-6 py-3 text-sm",
  lg: "px-8 py-4 text-base",
};

interface CommonProps {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: CommonProps & ComponentProps<"button">) {
  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    >
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  children,
  href,
  ...props
}: CommonProps & ComponentProps<typeof Link>) {
  return (
    <Link
      href={href}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    >
      {children}
    </Link>
  );
}
