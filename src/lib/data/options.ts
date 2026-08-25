import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { getChapters } from "@/lib/data/chapters";
import {
  DEFAULT_REGISTRATION_OPTIONS,
  type OptionListKey,
  type RegistrationOptionLists,
} from "@/lib/constants";
import type { OptionListRow } from "@/lib/supabase/database.types";

export type { RegistrationOptionLists };

/** The built-in lists, used whenever the DB is unreachable, errors, or has no
 *  rows for a list. Same rule the nav applies: an empty table must not produce
 *  an empty dropdown. Deleting every option in /admin/settings therefore
 *  restores these rather than leaving a form nobody can complete — the admin
 *  screen says so where the delete buttons are. */
const FALLBACK: RegistrationOptionLists = DEFAULT_REGISTRATION_OPTIONS;

export async function getRegistrationOptions(): Promise<RegistrationOptionLists> {
  try {
    const [{ data }, chapters] = await Promise.all([
      createServiceClient()
        .from("option_lists")
        .select("list_key, value, sort_order")
        .order("sort_order", { ascending: true }),
      // Published, undeleted, in display order — and no fixture fallback, so
      // an outage yields [] rather than invented chapter names.
      getChapters(),
    ]);

    const rows = (data as Pick<OptionListRow, "list_key" | "value" | "sort_order">[] | null) ?? [];
    const pick = (key: OptionListKey) =>
      rows.filter((r) => r.list_key === key).map((r) => r.value);

    const gender = pick("gender");
    const shirtSize = pick("shirt_size");

    // Each list falls back independently: emptying the shirt sizes must not
    // also revert a gender list the admin has deliberately edited.
    return {
      gender: gender.length > 0 ? gender : FALLBACK.gender,
      shirt_size: shirtSize.length > 0 ? shirtSize : FALLBACK.shirt_size,
      chapters: chapters.map((c) => c.name),
    };
  } catch {
    return FALLBACK;
  }
}
