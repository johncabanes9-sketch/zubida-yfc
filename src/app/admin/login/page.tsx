import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Sunburst } from "@/components/shared/sunburst";
import { SIGN_IN_NOTICES } from "@/lib/validation/sign-in";
import { LoginForm } from "./_components/login-form";

export const metadata = { title: "Admin Sign In", robots: { index: false } };

export default async function AdminLogin({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  // Only known codes render; an arbitrary ?error= value never reaches the page.
  const notice = error && Object.hasOwn(SIGN_IN_NOTICES, error) ? SIGN_IN_NOTICES[error] : null;

  return (
    <section className="mx-auto flex min-h-[100svh] max-w-md items-center px-4 pb-12 pt-28 sm:pt-32">
      <div className="w-full">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-dawn-soft text-gold-300 shadow-soft">
            <Sunburst className="h-6 w-6" rays={12} />
          </span>
          <div>
            <p className="font-display text-lg font-semibold leading-none">Zubida YFC</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted">Admin Portal</p>
          </div>
        </div>
        <LoginForm notice={notice} />
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-1.5 rounded py-1.5 text-sm font-medium text-muted transition-colors hover:text-[color:var(--fg)]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to the website
        </Link>
      </div>
    </section>
  );
}
