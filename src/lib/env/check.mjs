// Plain JavaScript, not TypeScript: next.config.mjs imports this at build time,
// before anything is compiled.

/**
 * What the deployed app cannot run without. SUPABASE_DB_URL is absent on
 * purpose: only scripts/db-migrate.mjs and the prove suites use it, never the
 * running site. Email is optional (degraded mode logs to email_log).
 */
const REQUIRED = [
  ["NEXT_PUBLIC_SUPABASE_URL", "the Supabase project URL — admin, registration and the contact form all need it"],
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "the Supabase anon key"],
  ["SUPABASE_SERVICE_ROLE_KEY", "the Supabase service-role key — registration and the contact form write with it"],
  ["CRON_SECRET", "guards /api/cron/keepalive; without it Supabase can pause the project"],
];

/** Set and not blank. Vercel happily stores an empty value, and did. */
const present = (v) => typeof v === "string" && v.trim().length > 0;

/**
 * @param {Record<string, string | undefined>} env
 * @returns {{ errors: string[] }}
 * Messages name variables, never values: build logs are widely readable.
 */
export function checkDeployEnv(env) {
  const errors = [];

  for (const [key, why] of REQUIRED) {
    if (!present(env[key])) errors.push(`${key} is empty or unset (${why}).`);
  }

  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  if (present(url)) {
    let ok = false;
    try {
      ok = new URL(url.trim()).protocol === "https:";
    } catch {
      ok = false;
    }
    if (!ok) errors.push("NEXT_PUBLIC_SUPABASE_URL must be a full https:// URL, e.g. https://<ref>.supabase.co.");
  }

  // Half a captcha is worse than none: the secret alone rejects every public
  // form (no widget renders, so no token is sent); the site key alone shows a
  // widget whose answer is never checked.
  const secret = present(env.TURNSTILE_SECRET_KEY);
  const siteKey = present(env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
  if (secret !== siteKey) {
    errors.push(
      `Set both TURNSTILE_SECRET_KEY and NEXT_PUBLIC_TURNSTILE_SITE_KEY, or neither (only ${secret ? "the secret" : "the site key"} is set).`,
    );
  }

  return { errors };
}

/**
 * Fails a production build on a broken configuration; warns on a preview.
 *
 * Failing the build is the point: Vercel keeps serving the last good
 * deployment, instead of promoting one that cannot reach its database while
 * the public pages quietly fall back to built-in content. Previews only warn,
 * so a pull request's deploy check stays usable before production is set up.
 *
 * @param {Record<string, string | undefined>} env
 * @param {string | undefined} vercelEnv  process.env.VERCEL_ENV
 */
export function assertDeployEnv(env, vercelEnv) {
  if (vercelEnv !== "production" && vercelEnv !== "preview") return;
  const { errors } = checkDeployEnv(env);
  if (errors.length === 0) return;

  const list = errors.map((e) => `  - ${e}`).join("\n");
  if (vercelEnv === "preview") {
    console.warn(`\n⚠ Preview deployment is missing configuration; parts of it will not work:\n${list}\n`);
    return;
  }
  throw new Error(
    `\nProduction build stopped: required configuration is missing.\n${list}\n\n` +
      "Set these in Vercel → Project → Settings → Environment Variables (Production), then redeploy.\n" +
      "The previous production deployment keeps serving until then.\n",
  );
}
