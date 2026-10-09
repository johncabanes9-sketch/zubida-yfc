"use client";

import { useActionState, useId, useState } from "react";
import { AlertCircle, Eye, EyeOff, Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signIn } from "../actions";
import { SIGN_IN_LIMITS, type SignInState } from "@/lib/validation/sign-in";

const INPUT =
  "w-full rounded-xl border border-[color:var(--rule-strong)] bg-[color:var(--surface)] px-3.5 py-3 text-sm text-[color:var(--fg)] placeholder:text-neutral-500 outline-none transition-colors focus:border-royal-500 focus:ring-2 focus:ring-royal-500/25 aria-[invalid=true]:border-danger-500 dark:placeholder:text-neutral-400 dark:focus:border-gold-400 dark:focus:ring-gold-400/25";

export function LoginForm({ notice }: { notice: string | null }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, {
    error: notice,
    fieldError: false,
    email: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const errorId = useId();
  const passwordId = useId();
  const hasError = state.fieldError;

  return (
    <form action={action} aria-busy={pending} className="surface space-y-5 rounded-3xl p-6 shadow-card sm:p-8" noValidate>
      <div>
        <h1 className="font-display text-2xl font-semibold">Sign in</h1>
        <p className="mt-1 text-sm text-muted">For YFC officers and administrators.</p>
      </div>

      {state.error && (
        <p
          id={errorId}
          role="alert"
          className="flex items-start gap-2 rounded-xl bg-danger-50 px-4 py-3 text-sm text-danger-700 dark:bg-danger-300/15 dark:text-danger-300"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      )}

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">Email</span>
        <input
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          maxLength={SIGN_IN_LIMITS.email}
          defaultValue={state.email}
          placeholder="you@example.com"
          aria-invalid={hasError}
          aria-describedby={hasError ? errorId : undefined}
          className={INPUT}
        />
      </label>

      <div>
        <label htmlFor={passwordId} className="mb-1.5 block text-sm font-medium">
          Password
        </label>
        <div className="relative">
          <input
            id={passwordId}
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            maxLength={SIGN_IN_LIMITS.password}
            aria-invalid={hasError}
            aria-describedby={hasError ? errorId : undefined}
            className={`${INPUT} pr-12`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            aria-controls={passwordId}
            className="absolute inset-y-0 right-1 my-auto grid h-10 w-10 place-items-center rounded-lg text-muted transition-colors hover:bg-black/5 hover:text-[color:var(--fg)] dark:hover:bg-white/10"
          >
            {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
          </button>
        </div>
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Signing in…
          </>
        ) : (
          <>
            <LogIn className="h-4 w-4" aria-hidden /> Sign in
          </>
        )}
      </Button>

      <p className="text-center text-xs text-muted">
        Accounts are created by the provincial office. Forgot your password? Ask your Provincial Youth Head to reset it.
      </p>
    </form>
  );
}
