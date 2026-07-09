"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Clock, Loader2, Search, XCircle } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { lookupRegistration } from "./actions";
import type { CheckResult } from "@/lib/supabase/database.types";
import { formatDate } from "@/lib/utils";

const statusStyle: Record<string, { color: string; icon: typeof Clock; label: string }> = {
  pending: { color: "text-amber-600 dark:text-amber-400", icon: Clock, label: "Pending approval" },
  approved: { color: "text-emerald-600 dark:text-emerald-400", icon: CheckCircle2, label: "Approved" },
  rejected: { color: "text-rose-600 dark:text-rose-400", icon: XCircle, label: "Not approved" },
  cancelled: { color: "text-slate-500", icon: XCircle, label: "Cancelled" },
};

export default function StatusPage() {
  const [id, setId] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<CheckResult | null>(null);

  const check = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setRes(null);
    setRes(await lookupRegistration(id, email));
    setLoading(false);
  };

  const s = res?.found && res.status ? statusStyle[res.status] : null;

  return (
    <>
      <PageHeader
        eyebrow="Registration"
        title="Check your status"
        subtitle="Enter your registration ID and email to see whether your slot is confirmed."
      />
      <section className="mx-auto max-w-xl px-4 py-16 sm:px-6">
        <form onSubmit={check} className="glass space-y-4 rounded-3xl p-6 shadow-card sm:p-8">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">Registration ID</span>
            <input
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="ZYFC-XXXX-1234"
              required
              className="w-full rounded-xl border border-black/10 bg-white/70 px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-royal-500 dark:border-white/10 dark:bg-midnight-800"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">Email</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="you@email.com"
              required
              className="w-full rounded-xl border border-black/10 bg-white/70 px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-royal-500 dark:border-white/10 dark:bg-midnight-800"
            />
          </label>
          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Checking…</>
            ) : (
              <><Search className="h-4 w-4" /> Check status</>
            )}
          </Button>
        </form>

        {res && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass mt-6 rounded-3xl p-8 text-center shadow-card"
          >
            {res.found && s ? (
              <>
                <div className={`mx-auto grid h-14 w-14 place-items-center rounded-full bg-current/10 ${s.color}`}>
                  <s.icon className="h-8 w-8" />
                </div>
                <p className={`mt-4 font-display text-2xl font-semibold ${s.color}`}>{s.label}</p>
                <p className="mt-3 text-sm text-muted">{res.event_name}</p>
                {res.event_date && (
                  <p className="text-sm text-muted">{formatDate(res.event_date)}</p>
                )}
                <p className="mt-4 text-sm">
                  {res.full_name} · <span className="font-mono">{res.registration_id}</span>
                </p>
              </>
            ) : (
              <>
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-slate-500/10 text-slate-500">
                  <XCircle className="h-8 w-8" />
                </div>
                <p className="mt-4 font-medium">No matching registration found</p>
                <p className="mt-1 text-sm text-muted">
                  Double-check your registration ID and the email you used.
                </p>
              </>
            )}
          </motion.div>
        )}
      </section>
    </>
  );
}
