-- Move the canonical site URL out of source and into site_settings.
--
-- src/app/layout.tsx hardcoded `metadataBase: new URL("https://zubidayfc.org")`,
-- which drives canonical links and Open Graph image URLs. It was the last piece
-- of organization identity that could not be corrected without a deploy
-- (ZUBIDA_CONTENT_AUDIT.md §2.1, §9.7).
--
-- The seeded value is the one already in source, so behaviour is unchanged. It
-- is NOT verified — see the audit's confirmation list. Centralizing it means the
-- correction is a settings edit rather than a code change.

alter table site_settings add column if not exists site_url text;

update site_settings
set site_url = 'https://zubidayfc.org'
where id = 1 and site_url is null;
