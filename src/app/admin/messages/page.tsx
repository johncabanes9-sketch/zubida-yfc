import Link from "next/link";
import { Archive, Inbox, Mail, MailOpen, Reply } from "lucide-react";
import { requirePYH, createServerSupabase } from "@/lib/supabase/admin-auth";
import { AdminShell } from "../_components/admin-shell";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { setMessageStatus, type MessageStatus } from "./actions";

export const metadata = { title: "Messages", robots: { index: false } };
export const dynamic = "force-dynamic";

const INBOX_PAGE_SIZE = 100;

type MessageRow = {
  id: string;
  name: string;
  email: string;
  subject: string | null;
  message: string;
  status: MessageStatus;
  created_at: string;
};

type View = "inbox" | "archived";

const STATUS_TONE: Record<MessageStatus, BadgeTone> = {
  new: "gold",
  read: "neutral",
  archived: "neutral",
};

function StatusButton({ id, status, children }: { id: string; status: MessageStatus; children: React.ReactNode }) {
  return (
    <form action={setMessageStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <Button type="submit" size="xs" variant="subtle">{children}</Button>
    </form>
  );
}

function MessageCard({ m }: { m: MessageRow }) {
  const replySubject = encodeURIComponent(`Re: ${m.subject ?? "Your message to Zubida YFC"}`);
  return (
    <article
      aria-labelledby={`msg-${m.id}`}
      className={cn(
        "glass rounded-2xl p-5 shadow-card",
        m.status === "new" && "ring-1 ring-gold-400/60",
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`msg-${m.id}`} className="font-semibold text-[var(--fg)]">
            {m.subject ?? <span className="italic text-muted">No subject</span>}
          </h2>
          <p className="mt-0.5 break-all text-sm text-muted">
            {m.name} · <a href={`mailto:${m.email}`} className="underline-offset-2 hover:underline">{m.email}</a>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={STATUS_TONE[m.status]}>{m.status}</Badge>
          <time dateTime={m.created_at} className="whitespace-nowrap text-xs text-muted">
            {new Date(m.created_at).toLocaleString()}
          </time>
        </div>
      </header>

      <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed">{m.message}</p>

      <footer className="mt-4 flex flex-wrap gap-2">
        <a
          href={`mailto:${m.email}?subject=${replySubject}`}
          className="inline-flex items-center gap-2 rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-200 dark:bg-white/10 dark:text-neutral-300 dark:hover:bg-white/15"
        >
          <Reply className="h-3.5 w-3.5" /> Reply by email
        </a>
        {m.status === "new" && (
          <StatusButton id={m.id} status="read"><MailOpen className="h-3.5 w-3.5" /> Mark read</StatusButton>
        )}
        {m.status === "read" && (
          <StatusButton id={m.id} status="new"><Mail className="h-3.5 w-3.5" /> Mark unread</StatusButton>
        )}
        {m.status === "archived" ? (
          <StatusButton id={m.id} status="read"><Inbox className="h-3.5 w-3.5" /> Move to inbox</StatusButton>
        ) : (
          <StatusButton id={m.id} status="archived"><Archive className="h-3.5 w-3.5" /> Archive</StatusButton>
        )}
      </footer>
    </article>
  );
}

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const ctx = await requirePYH();
  const view: View = (await searchParams).view === "archived" ? "archived" : "inbox";

  const supabase = await createServerSupabase();
  const query = supabase
    .from("contact_messages")
    .select("id, name, email, subject, message, status, created_at")
    .order("created_at", { ascending: false })
    .limit(INBOX_PAGE_SIZE);
  const { data, error } = view === "archived"
    ? await query.eq("status", "archived")
    : await query.in("status", ["new", "read"]);
  const rows = (data as MessageRow[] | null) ?? [];
  const unread = rows.filter((r) => r.status === "new").length;

  const tab = (v: View, label: string) => (
    <Link
      href={v === "inbox" ? "/admin/messages" : "/admin/messages?view=archived"}
      aria-current={view === v ? "page" : undefined}
      className={cn(
        "rounded-full px-4 py-2 text-sm font-semibold",
        view === v
          ? "bg-royal-700 text-white dark:bg-gold-400 dark:text-midnight-900"
          : "text-muted hover:bg-neutral-100 dark:hover:bg-white/5",
      )}
    >
      {label}
    </Link>
  );

  return (
    <AdminShell
      ctx={ctx}
      active="messages"
      title="Messages"
      description={
        view === "inbox"
          ? `Messages sent from the public contact form, newest first.${unread ? ` ${unread} unread.` : ""}`
          : "Archived messages. Nothing is deleted; move one back to the inbox at any time."
      }
    >
      <nav aria-label="Message views" className="mb-6 flex gap-2">
        {tab("inbox", "Inbox")}
        {tab("archived", "Archived")}
      </nav>

      {error ? (
        <p role="alert" className="rounded-2xl bg-danger-50 p-4 text-sm text-danger-700 dark:bg-danger-300/15 dark:text-danger-300">
          Messages could not be loaded: {error.message}
        </p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={view === "inbox" ? "No messages" : "Nothing archived"}
          description={
            view === "inbox"
              ? "Messages sent from the contact page appear here."
              : "Archived messages appear here."
          }
        />
      ) : (
        <div className="space-y-4">
          {rows.map((m) => <MessageCard key={m.id} m={m} />)}
        </div>
      )}
    </AdminShell>
  );
}
