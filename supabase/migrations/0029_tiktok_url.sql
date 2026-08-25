-- Give site_settings somewhere to store a TikTok URL.
--
-- The organization has a TikTok presence to publish, but the link has not been
-- confirmed yet. The column is added ahead of the value on purpose: without it,
-- adding the link later is a migration, a schema change, a form field, a footer
-- icon and a deploy. With it, the link is a paste into /admin/settings.
--
-- No value is seeded. A blank hides the icon in the footer, the same way a
-- withheld email hides its row (src/lib/content/contact.ts), so the site shows
-- nothing rather than an icon linking nowhere. Seeding a guessed handle is the
-- mistake 0027 and 0028 exist to undo.

alter table site_settings add column if not exists tiktok_url text;
