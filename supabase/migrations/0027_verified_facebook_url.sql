-- Correct the Facebook page published in the footer.
--
-- 0013 seeded site_settings verbatim from src/lib/constants.ts, which carried
-- an invented social handle (ZUBIDA_CONTENT_AUDIT.md §7.1):
--
--   facebook_url  https://facebook.com/zubidayfc
--
-- The audit flagged it as never validated. Unlike the placeholder email and
-- phone that 0022 withheld, this one has now been confirmed by the
-- organization: the real page is https://www.facebook.com/yfczds. So it is
-- corrected rather than blanked.
--
-- The constant in src/lib/constants.ts is updated in the same change, because
-- it backs the DB-outage fallback. Correcting only one of the two would show
-- one page when the database is up and another when it is down — the
-- conflicting-identity failure §1 of prove:content exists to catch.
--
-- Guarded on the exact stand-in, so a value an administrator has since
-- corrected in /admin/settings is never overwritten, and re-running this
-- migration cannot undo a later edit.

update site_settings
set facebook_url = 'https://www.facebook.com/yfczds',
    updated_at = now()
where id = 1
  and facebook_url = 'https://facebook.com/zubidayfc';
