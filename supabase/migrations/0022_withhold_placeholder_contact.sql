-- Withhold the placeholder contact details published on the live site.
--
-- 0013 seeded site_settings verbatim from src/lib/constants.ts, which carried
-- two Phase-1 stand-ins (ZUBIDA_CONTENT_AUDIT.md §7.2):
--
--   email  hello@zubidayfc.org
--   phone  +63 962 000 0000
--
-- Every other unverified claim in this audit was withheld. These two were not,
-- because they are well-formed: `prove:content` asserts explicitly that shape
-- validation accepts `+63 962 000 0000`, so no amount of stricter parsing would
-- have caught them. A visitor reading either one has been given a working-
-- looking way to reach an organization that does not answer there.
--
-- Blanking is the withholding. The public surfaces now drop a blank channel
-- entirely (src/lib/content/contact.ts), the validation schema accepts a blank
-- so a PYH admin can restore or re-clear it in /admin/settings, and the
-- constants that back the DB-outage fallback are blank for the same reason.
--
-- Both statements are guarded on the exact stand-in, so a value an
-- administrator has since corrected is never cleared, and re-running this
-- migration cannot re-blank a field that has since been filled in.

-- 1. Withhold the placeholder email address.
update site_settings
set email = '',
    updated_at = now()
where id = 1
  and email = 'hello@zubidayfc.org';

-- 2. Withhold the placeholder phone number.
update site_settings
set phone = '',
    updated_at = now()
where id = 1
  and phone = '+63 962 000 0000';
