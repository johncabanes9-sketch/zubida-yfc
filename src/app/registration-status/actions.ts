"use server";
import { createServiceClient } from "@/lib/supabase/server";
import type { CheckResult } from "@/lib/supabase/database.types";

export async function lookupRegistration(
  registrationId: string,
  email: string,
): Promise<CheckResult> {
  const db = createServiceClient();
  const { data, error } = await db.rpc("check_registration", {
    p_registration_id: registrationId.trim(),
    p_email: email.trim(),
  });
  if (error) return { found: false };
  return (data as CheckResult) ?? { found: false };
}
