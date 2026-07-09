"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Info, Loader2 } from "lucide-react";
import type { EventItem } from "@/data/types";
import { Button } from "@/components/ui/button";

const chapters = [
  "Pagadian City", "Molave", "Labangan", "Aurora", "Tukuran",
  "Margosatubig", "Tambulig", "Mahayag", "Dumingag", "San Miguel",
  "Tabina", "Ramon Magsaysay",
];
const shirtSizes = ["XS", "S", "M", "L", "XL", "2XL", "3XL"];

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

export function RegistrationForm({ event }: { event: EventItem }) {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<Success | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);

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
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-500/15 text-emerald-500">
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
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-royal-600 dark:text-gold-300" />
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

  return (
    <form onSubmit={submit} className="space-y-5 p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" required><input {...inp} name="fullName" required /></Field>
        <Field label="Nickname"><input {...inp} name="nickname" /></Field>
        <Field label="Birthdate" required><input {...inp} type="date" name="birthdate" required /></Field>
        <Field label="Age" required><input {...inp} type="number" min={10} max={40} name="age" required /></Field>
        <Field label="Gender">
          <select {...inp} name="gender" defaultValue="">
            <option value="" disabled>Select…</option>
            <option>Male</option><option>Female</option><option>Prefer not to say</option>
          </select>
        </Field>
        <Field label="Email" required><input {...inp} type="email" name="email" required /></Field>
        <Field label="Phone number" required><input {...inp} type="tel" name="phone" required /></Field>
        <Field label="Chapter" required>
          <select {...inp} name="chapter" required defaultValue="">
            <option value="" disabled>Select chapter…</option>
            {chapters.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Cluster"><input {...inp} name="cluster" placeholder="e.g. Bay Cluster" /></Field>
        <Field label="Parish"><input {...inp} name="parish" /></Field>
        <Field label="School"><input {...inp} name="school" /></Field>
        <Field label="T-shirt size">
          <select {...inp} name="shirt" defaultValue="">
            <option value="" disabled>Select…</option>
            {shirtSizes.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Emergency contact" required><input {...inp} name="emContact" required /></Field>
        <Field label="Emergency number" required><input {...inp} type="tel" name="emNumber" required /></Field>
        <Field label="Medical concerns"><input {...inp} name="medical" placeholder="None" /></Field>
        <Field label="Food restrictions"><input {...inp} name="food" placeholder="None" /></Field>
      </div>

      <label className="flex items-center gap-3 rounded-2xl bg-white/60 p-3 text-sm dark:bg-white/5">
        <input
          type="checkbox"
          name="transport"
          className="h-4 w-4 accent-royal-700"
        />
        I need transportation to the venue
      </label>

      <label className="flex items-start gap-3 rounded-2xl bg-white/60 p-4 text-sm dark:bg-white/5">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          required
          className="mt-0.5 h-4 w-4 accent-royal-700"
        />
        <span>
          I consent to Zubida YFC collecting this information for event
          coordination, and I agree to the community guidelines and data privacy
          policy.
        </span>
      </label>

      {error && (
        <div className="flex items-start gap-2 rounded-2xl bg-rose-500/10 p-4 text-sm text-rose-600 dark:text-rose-400">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={submitting || !consent}
      >
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

const inp = {
  className:
    "w-full rounded-xl border border-black/10 bg-white/70 px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-royal-500 dark:border-white/10 dark:bg-midnight-800",
};

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted">
        {label}
        {required && <span className="text-gold-600"> *</span>}
      </span>
      {children}
    </label>
  );
}
