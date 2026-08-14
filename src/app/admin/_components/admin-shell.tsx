import Link from "next/link";
import type { AdminContext } from "@/lib/rbac";
import { signOut } from "../login/actions";
import { Button } from "@/components/ui/button";

type Tab = "registrations" | "events" | "pages" | "users" | "logs" | "settings";

const baseTabs: { key: Tab; href: string; label: string; pyhOnly?: boolean }[] = [
  { key: "registrations", href: "/admin", label: "Registrations" },
  { key: "events", href: "/admin/events", label: "Events" },
  { key: "pages", href: "/admin/pages", label: "Pages", pyhOnly: true },
  { key: "users", href: "/admin/users", label: "Users", pyhOnly: true },
  { key: "logs", href: "/admin/logs", label: "Logs", pyhOnly: true },
  { key: "settings", href: "/admin/settings", label: "Settings", pyhOnly: true },
];

export function AdminShell({
  ctx,
  active,
  title,
  children,
}: {
  ctx: AdminContext;
  active: Tab;
  title: string;
  children: React.ReactNode;
}) {
  const tabs = baseTabs.filter((t) => !t.pyhOnly || ctx.isPYH);
  return (
    <section className="mx-auto max-w-7xl px-4 pb-24 pt-28 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-gold-600 dark:text-gold-400">
            Admin{ctx.isPYH ? " · Provincial" : " · Cluster Head"}
          </p>
          <h1 className="font-display text-3xl font-semibold">{title}</h1>
        </div>
        <form action={signOut}>
          <Button variant="ghost" size="sm" type="submit">Sign out</Button>
        </form>
      </div>

      <nav className="mt-6 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              t.key === active
                ? "bg-royal-700 text-white dark:bg-gold-400 dark:text-royal-950"
                : "glass text-muted hover:text-royal-700 dark:hover:text-gold-300"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="mt-8">{children}</div>
    </section>
  );
}
