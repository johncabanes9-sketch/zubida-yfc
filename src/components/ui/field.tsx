import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Form primitives. Before these existed the same `field` and `label` class
 * strings were re-declared in nine components and had already drifted apart
 * (three different paddings, two different focus treatments). Every admin and
 * public form now shares one definition.
 *
 * `Field` wraps its control in the `<label>` itself, so the control is
 * associated implicitly and no caller has to invent and match an `id`. Hint
 * and error text live inside that same label, which means screen readers
 * announce them with the field without any `aria-describedby` bookkeeping.
 */

const controlBase =
  "mt-1.5 w-full rounded-xl border bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--fg)] " +
  "border-[var(--rule)] outline-none transition-colors " +
  "placeholder:text-neutral-400 dark:placeholder:text-neutral-500 " +
  "hover:border-[var(--rule-strong)] " +
  "focus:border-royal-500 focus:ring-2 focus:ring-royal-500/25 dark:focus:border-gold-400 dark:focus:ring-gold-400/25 " +
  "disabled:cursor-not-allowed disabled:opacity-60";

/**
 * The same control styling as a raw class string.
 *
 * Forms that are already built out of hand-written <label> markup — the page
 * editor and the two directory forms — consume these instead of the components
 * above. That is deliberate: it removes the drift (which was the real defect:
 * nine copies had become three paddings and two focus treatments) without
 * restructuring JSX that a browser proof asserts against.
 */
export const fieldClass = controlBase;
export const labelClass =
  "text-xs font-semibold uppercase tracking-wide text-muted";

const invalidRing =
  "border-danger-500 focus:border-danger-500 focus:ring-danger-500/25 " +
  "dark:border-danger-300 dark:focus:border-danger-300 dark:focus:ring-danger-300/25";

interface FieldProps {
  label: string;
  /** Renders the required marker and its screen-reader text. Set it on the control too. */
  required?: boolean;
  /** Guidance shown before the user makes a mistake. */
  hint?: string;
  /** Validation message. Presence also switches the label to the danger tone. */
  error?: string;
  className?: string;
  children: ReactNode;
}

export function Field({
  label,
  required = false,
  hint,
  error,
  className,
  children,
}: FieldProps) {
  return (
    <label className={cn("block", className)}>
      <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
        {required && (
          <>
            <span aria-hidden="true" className="text-danger-700 dark:text-danger-300">
              *
            </span>
            <span className="sr-only">(required)</span>
          </>
        )}
      </span>
      {children}
      {hint && !error && <span className="mt-1.5 block text-xs text-muted">{hint}</span>}
      {error && (
        <span className="mt-1.5 block text-xs font-medium text-danger-700 dark:text-danger-300">
          {error}
        </span>
      )}
    </label>
  );
}

interface ControlProps {
  invalid?: boolean;
}

export function Input({
  className,
  invalid = false,
  ...props
}: ControlProps & ComponentProps<"input">) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(controlBase, invalid && invalidRing, className)}
      {...props}
    />
  );
}

export function Textarea({
  className,
  invalid = false,
  ...props
}: ControlProps & ComponentProps<"textarea">) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={cn(controlBase, "resize-y", invalid && invalidRing, className)}
      {...props}
    />
  );
}

export function Select({
  className,
  invalid = false,
  children,
  ...props
}: ControlProps & ComponentProps<"select">) {
  return (
    <select
      aria-invalid={invalid || undefined}
      className={cn(controlBase, "cursor-pointer pr-9", invalid && invalidRing, className)}
      {...props}
    >
      {children}
    </select>
  );
}

/** Groups related fields under a heading, with a rule to separate sections of a long form. */
export function FieldGroup({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={cn("min-w-0 border-0 p-0", className)}>
      <legend className="font-display text-base font-semibold text-[var(--fg)]">{title}</legend>
      {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      <div className="mt-4 grid gap-4">{children}</div>
    </fieldset>
  );
}
