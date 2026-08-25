"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Info, Loader2 } from "lucide-react";
import type { EventItem } from "@/data/types";
import {
  DEFAULT_REGISTRATION_OPTIONS as FALLBACK_OPTIONS,
  type RegistrationOptionLists,
} from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, Input, Select } from "@/components/ui/field";
import { Turnstile } from "./turnstile";

/** Inlined at build time. Unset locally, which puts the server in degraded mode too. */
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

type Success = { registrationId: string; qr: string };

async function postWithRetry(payload: Record<string, unknown>, tries = 3): Promise<Response> {
  for (let i = 0; i < tries; i++) {
    try {
      return await fetch("/api/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      if (i === tries - 1) throw e; // only network errors reach here
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw new Error("unreachable");
}

/** Counts required controls that are filled and valid, over the total.
 *  Read off the live DOM rather than mirrored into state: seventeen fields
 *  would otherwise mean seventeen controlled inputs and a re-render per
 *  keystroke, to display one number. */
function completion(form: HTMLFormElement): { done: number; total: number } {
  const required = form.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[required]");
  let done = 0;
  for (const el of required) {
    const filled =
      el instanceof HTMLInputElement && el.type === "checkbox"
        ? el.checked
        : el.value.trim() !== "";
    if (filled && el.validity.valid) done++;
  }
  return { done, total: required.length };
}

/** `options` is threaded down from the server component that renders the event,
 *  so the dropdowns are correct in the first paint rather than after a fetch.
 *
 *  The default covers the places (and tests) that render this form with no
 *  database behind them. It carries the built-in gender and shirt sizes, which
 *  the PYH edits in /admin/settings — but no chapters, because there is no such
 *  thing as a built-in chapter. That field degrades to free text instead. */
export function RegistrationForm({
  event,
  options = FALLBACK_OPTIONS,
}: {
  event: EventItem;
  options?: RegistrationOptionLists;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<Success | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const formRef = useRef<HTMLFormElement>(null);

  const recount = useCallback(() => {
    if (formRef.current) setProgress(completion(formRef.current));
  }, []);

  // Count once on mount. Without this the bar reads "0 of 0 required fields"
  // until the first keystroke, because nothing has fired an input event yet —
  // and a total of zero is exactly the number a reader should not be shown.
  useEffect(() => {
    recount();
  }, [recount]);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting || done) return; // guard against double submit
    setError(null);
    setSubmitting(true);
    const fd = new FormData(e.currentTarget);
    const payload = {
      event_id: event.id,
      full_name: fd.get("fullName"),
      nickname: fd.get("nickname") || "",
      birthdate: fd.get("birthdate") || "",
      age: fd.get("age"),
      gender: fd.get("gender") || "",
      email: fd.get("email"),
      phone: fd.get("phone") || "",
      chapter: fd.get("chapter"),
      cluster: fd.get("cluster") || "",
      parish: fd.get("parish") || "",
      school: fd.get("school") || "",
      emergency_contact: fd.get("emContact") || "",
      emergency_number: fd.get("emNumber") || "",
      medical_concerns: fd.get("medical") || "",
      food_restrictions: fd.get("food") || "",
      shirt_size: fd.get("shirt") || "",
      transport_needed: fd.get("transport") === "on",
      consent: fd.get("consent") === "on",
      captchaToken: (fd.get("cf-turnstile-response") as string) || undefined,
    };
    try {
      const res = await postWithRetry(payload);
      const data = await res.json();
      if (data.ok) setDone({ registrationId: data.registration_id, qr: data.qr });
      else setError(data.message ?? "Something went wrong. Please try again.");
    } catch {
      setError("We couldn't reach the server. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-8 text-center"
      >
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-success-50 text-success-700 dark:bg-success-300/15 dark:text-success-300">
          <CheckCircle2 className="h-9 w-9" />
        </div>
        <h3 className="mt-5 font-display text-2xl font-semibold">You&apos;re registered!</h3>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
          Your slot for <strong>{event.name}</strong> is reserved (pending
          approval). Save this QR code — it&apos;s your event pass. A confirmation
          has been sent to your email.
        </p>

        <div className="mx-auto mt-6 w-fit rounded-3xl bg-white p-5 shadow-card dark:bg-midnight-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={done.qr} width={160} height={160} alt="Your registration QR code" className="mx-auto" />
          <p className="mt-3 text-xs uppercase tracking-wide text-muted">Registration ID</p>
          <p className="font-mono text-lg font-semibold text-royal-700 dark:text-gold-300">
            {done.registrationId}
          </p>
        </div>

        <div className="mx-auto mt-6 flex max-w-sm items-start gap-2 rounded-2xl bg-royal-700/8 p-4 text-left text-sm text-muted dark:bg-white/5">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-royal-700 dark:text-gold-300" />
          <span>
            You can check your approval status anytime at{" "}
            <a href="/registration-status" className="font-semibold text-royal-700 underline dark:text-gold-300">
              /registration-status
            </a>{" "}
            using your ID and email.
          </span>
        </div>
      </motion.div>
    );
  }

  const pct = progress.total > 0 ? (progress.done / progress.total) * 100 : 0;
  const complete = progress.total > 0 && progress.done === progress.total;

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      onInput={recount}
      onChange={recount}
      className="space-y-7 p-6"
    >
      {/* Seventeen fields in one flat block is the thing that made this form feel
          long. Grouping them, and saying how much is left, is most of the fix. */}
      <div>
        <div className="mb-1.5 flex items-baseline justify-between text-xs">
          <span className="font-semibold uppercase tracking-wide text-muted">
            Registration progress
          </span>
          <span
            aria-live="polite"
            className={
              complete
                ? "font-semibold text-success-700 dark:text-success-300"
                : "font-semibold text-muted"
            }
          >
            {complete
              ? "All set — you can submit"
              : `${progress.done} of ${progress.total} required fields`}
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={progress.done}
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-label="Required fields completed"
          className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--chart-track)]"
        >
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{
              width: `${pct}%`,
              backgroundColor: complete ? "var(--chart-approved)" : "var(--chart-primary)",
            }}
          />
        </div>
      </div>

      <FieldGroup title="About you">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" required>
            <Input name="fullName" required autoComplete="name" />
          </Field>
          <Field label="Nickname">
            <Input name="nickname" autoComplete="nickname" />
          </Field>
          <Field label="Birthdate" required>
            <Input type="date" name="birthdate" required autoComplete="bday" />
          </Field>
          <Field label="Age" required>
            <Input type="number" min={10} max={40} name="age" required />
          </Field>
          <Field label="Gender">
            <Select name="gender" defaultValue="">
              <option value="" disabled>Select…</option>
              {options.gender.map((g) => <option key={g}>{g}</option>)}
            </Select>
          </Field>
          <Field label="T-shirt size">
            <Select name="shirt" defaultValue="">
              <option value="" disabled>Select…</option>
              {options.shirt_size.map((s) => <option key={s}>{s}</option>)}
            </Select>
          </Field>
        </div>
      </FieldGroup>

      <FieldGroup title="How we reach you">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" required>
            <Input type="email" name="email" required autoComplete="email" />
          </Field>
          <Field label="Phone number" required>
            <Input type="tel" name="phone" required autoComplete="tel" />
          </Field>
          <Field label="Chapter" required>
            {/* The list is the published chapters and nothing else — there is
                no built-in fallback, because a fabricated chapter name is what
                this form used to offer. With nothing published there is nothing
                to choose from, and chapter is required, so the field degrades
                to free text rather than to a dropdown that cannot be answered. */}
            {options.chapters.length > 0 ? (
              <Select name="chapter" required defaultValue="">
                <option value="" disabled>Select chapter…</option>
                {options.chapters.map((c) => <option key={c}>{c}</option>)}
              </Select>
            ) : (
              <Input name="chapter" required placeholder="Your chapter" />
            )}
          </Field>
          <Field label="Cluster">
            {/* Free text, not a Select, because a registrant may belong to a
                cluster this deployment has not recorded yet. The example is
                one of the organization's real three (migration 0028). */}
            <Input name="cluster" placeholder="e.g. Central Cluster" />
          </Field>
          <Field label="Parish">
            <Input name="parish" />
          </Field>
          <Field label="School">
            <Input name="school" />
          </Field>
        </div>
      </FieldGroup>

      <FieldGroup
        title="In case of emergency"
        description="Someone we can call on the day if we need to, and anything we should know to keep you safe."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Emergency contact" required>
            <Input name="emContact" required />
          </Field>
          <Field label="Emergency number" required>
            <Input type="tel" name="emNumber" required />
          </Field>
          <Field label="Medical concerns">
            <Input name="medical" placeholder="None" />
          </Field>
          <Field label="Food restrictions">
            <Input name="food" placeholder="None" />
          </Field>
        </div>

        <label className="flex min-h-[44px] items-center gap-3 rounded-2xl bg-[var(--surface-2)] p-3 text-sm">
          <input
            type="checkbox"
            name="transport"
            className="h-4 w-4 rounded accent-royal-700 dark:accent-gold-400"
          />
          I need transportation to the venue
        </label>
      </FieldGroup>

      <label className="flex items-start gap-3 rounded-2xl bg-[var(--surface-2)] p-4 text-sm">
        <input
          type="checkbox"
          name="consent"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          required
          className="mt-0.5 h-4 w-4 rounded accent-royal-700 dark:accent-gold-400"
        />
        <span>
          I consent to Zubida YFC collecting this information for event
          coordination, and I agree to the community guidelines and data privacy
          policy.
        </span>
      </label>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-2xl bg-danger-50 p-4 text-sm text-danger-700 dark:bg-danger-300/15 dark:text-danger-300"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {TURNSTILE_SITE_KEY && <Turnstile siteKey={TURNSTILE_SITE_KEY} />}

      <Button type="submit" size="lg" className="w-full" disabled={submitting || !consent}>
        {submitting ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Reserving your slot…</>
        ) : (
          "Complete Registration"
        )}
      </Button>
      <p className="text-center text-xs text-muted">
        By registering you reserve a slot instantly — you&apos;ll get a QR pass and
        a confirmation email.
      </p>
    </form>
  );
}
