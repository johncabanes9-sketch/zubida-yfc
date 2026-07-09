"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ContactForm() {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (sending || sent) return;
    setSending(true);
    setTimeout(() => {
      setSending(false);
      setSent(true);
    }, 1100);
  };

  if (sent) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass flex flex-col items-center rounded-3xl p-10 text-center shadow-card"
      >
        <div className="grid h-16 w-16 place-items-center rounded-full bg-emerald-500/15 text-emerald-500">
          <CheckCircle2 className="h-9 w-9" />
        </div>
        <h3 className="mt-5 font-display text-2xl font-semibold">Message received</h3>
        <p className="mt-2 max-w-sm text-sm text-muted">
          Thank you for reaching out. This is a preview — in the live site your
          message would be delivered to the provincial office and answered within
          a few days. God bless you!
        </p>
      </motion.div>
    );
  }

  return (
    <form onSubmit={submit} className="glass space-y-4 rounded-3xl p-6 shadow-card sm:p-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">Name *</span>
          <input required className={field} name="name" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">Email *</span>
          <input required type="email" className={field} name="email" />
        </label>
      </div>
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-muted">Subject</span>
        <input className={field} name="subject" />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-muted">Message *</span>
        <textarea required rows={5} className={`${field} resize-none`} name="message" />
      </label>
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

const field =
  "w-full rounded-xl border border-black/10 bg-white/70 px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-royal-500 dark:border-white/10 dark:bg-midnight-800";
