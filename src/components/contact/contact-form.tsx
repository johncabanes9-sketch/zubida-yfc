"use client";
import { fieldClass } from "@/components/ui/field";

import { useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Turnstile } from "@/components/shared/turnstile";

/** Inlined at build time. Unset locally, which puts the server in degraded mode too. */
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

const text = (fd: FormData, name: string) => String(fd.get(name) ?? "");

export function ContactForm() {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // No retry on a network error, unlike registration: a registration is
  // deduplicated by email, a message is not, and a retried POST that did
  // land the first time would put the same message in the inbox twice.
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (sending || sent) return;
    setSending(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: text(fd, "name"),
          email: text(fd, "email"),
          subject: text(fd, "subject"),
          message: text(fd, "message"),
          captchaToken: text(fd, "cf-turnstile-response") || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (res.ok && data.ok) setSent(true);
      else setError(data.message ?? "Your message could not be sent. Please try again.");
    } catch {
      setError("We couldn't reach the server. Please check your connection and try again.");
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        role="status"
        className="glass flex flex-col items-center rounded-3xl p-10 text-center shadow-card"
      >
        <div className="grid h-16 w-16 place-items-center rounded-full bg-emerald-500/15 text-emerald-500">
          <CheckCircle2 className="h-9 w-9" />
        </div>
        <h3 className="mt-5 font-display text-2xl font-semibold">Message received</h3>
        <p className="mt-2 max-w-sm text-sm text-muted">
          Thank you for reaching out. Your message is with the provincial office,
          and a reply will come to the email address you gave. God bless you!
        </p>
      </motion.div>
    );
  }

  return (
    <form onSubmit={submit} className="glass space-y-4 rounded-3xl p-6 shadow-card sm:p-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">Name *</span>
          <input required maxLength={120} autoComplete="name" className={fieldClass} name="name" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">Email *</span>
          <input required type="email" maxLength={160} autoComplete="email" className={fieldClass} name="email" />
        </label>
      </div>
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-muted">Subject</span>
        <input maxLength={200} className={fieldClass} name="subject" />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-muted">Message *</span>
        <textarea
          required
          minLength={10}
          maxLength={5000}
          rows={5}
          className={`${fieldClass} resize-none`}
          name="message"
        />
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

      <Button type="submit" size="lg" className="w-full" disabled={sending}>
        {sending ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
        ) : (
          <><Send className="h-4 w-4" /> Send Message</>
        )}
      </Button>
    </form>
  );
}
