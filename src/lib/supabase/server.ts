import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Privileged server-side client (service role). Bypasses RLS — never import
 * this into a client component or expose the key via NEXT_PUBLIC_.
 * Falls back to the anon key if the service role key is not set, so the public
 * registration path (RPCs granted to anon) still works in that state.
 */
export function createServiceClient() {
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false },
  });
}

export function hasServiceRole() {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}
