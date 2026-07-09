import { Sunburst } from "@/components/shared/sunburst";
import { Button } from "@/components/ui/button";
import { signIn } from "./actions";

export const metadata = { title: "Admin Sign In", robots: { index: false } };

export default async function AdminLogin({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message =
    error === "invalid"
      ? "Incorrect email or password."
      : error === "not-admin"
        ? "That account doesn't have admin access."
        : null;

  return (
    <section className="mx-auto flex min-h-[85svh] max-w-md items-center px-4">
      <div className="w-full">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-dawn-soft text-gold-300 shadow-soft">
            <Sunburst className="h-6 w-6" rays={12} />
          </span>
          <div>
            <p className="font-display text-lg font-semibold leading-none">Zubida YFC</p>
            <p className="text-xs uppercase tracking-[0.18em] text-muted">Admin Portal</p>
          </div>
        </div>
        <form action={signIn} className="glass space-y-4 rounded-3xl p-8 shadow-card">
          <h1 className="font-display text-2xl font-semibold">Sign in</h1>
          {message && (
            <p className="rounded-xl bg-rose-500/10 px-4 py-3 text-sm text-rose-600 dark:text-rose-400">
              {message}
            </p>
          )}
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">Email</span>
            <input
              name="email"
              type="email"
              required
              className="w-full rounded-xl border border-black/10 bg-white/70 px-3.5 py-2.5 text-sm outline-none focus:border-royal-500 dark:border-white/10 dark:bg-midnight-800"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">Password</span>
            <input
              name="password"
              type="password"
              required
              className="w-full rounded-xl border border-black/10 bg-white/70 px-3.5 py-2.5 text-sm outline-none focus:border-royal-500 dark:border-white/10 dark:bg-midnight-800"
            />
          </label>
          <Button type="submit" size="lg" className="w-full">Sign in</Button>
        </form>
      </div>
    </section>
  );
}
