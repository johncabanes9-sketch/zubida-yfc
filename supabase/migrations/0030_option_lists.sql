-- Move the registration form's two value lists out of source and into the DB.
--
-- `gender` and `shirt_size` shipped as array literals in
-- src/components/shared/registration-form.tsx, so adding a shirt size or
-- rewording a gender option was a code change and a deploy.
--
-- These two are the only dropdowns in the app that can safely be handed over:
--
--   * registrations store them as plain text (0002: `gender text`,
--     `shirt_size text`) — no enum, no check constraint, and
--     src/lib/validation/registration.ts accepts them as optionalText, so an
--     option the PYH adds today is accepted by the API today;
--   * nothing in the codebase branches on their values, unlike events.status
--     ('Open'/'Closed'/'Finished') and events.scope, which 19 and 13 code
--     sites respectively read by name;
--   * no foreign key points at them, so deleting an option cannot orphan a
--     row. A registration keeps whatever text it was submitted with, which is
--     the historically correct answer — a member who chose "2XL" in 2026 still
--     chose it after the size is retired.
--
-- The list_key check constraint keeps this from becoming a junk drawer: a
-- third list is a deliberate migration, not a typo in a form field.

create table if not exists option_lists (
  id uuid primary key default gen_random_uuid(),
  list_key text not null,
  value text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint option_lists_known_key check (list_key in ('gender', 'shirt_size')),
  constraint option_lists_value_not_blank check (length(btrim(value)) > 0),
  unique (list_key, value)
);

create index if not exists option_lists_key_order_idx
  on option_lists (list_key, sort_order);

-- Seeded verbatim from REGISTRATION_OPTIONS in src/lib/constants.ts, which
-- backs the DB-outage fallback. prove:content asserts the two cannot drift:
-- if they did, the form would offer one set of choices when the database is up
-- and another when it is down.
insert into option_lists (list_key, value, sort_order) values
  ('gender', 'Male', 1),
  ('gender', 'Female', 2),
  ('gender', 'Prefer not to say', 3),
  ('shirt_size', 'XS', 1),
  ('shirt_size', 'S', 2),
  ('shirt_size', 'M', 3),
  ('shirt_size', 'L', 4),
  ('shirt_size', 'XL', 5),
  ('shirt_size', '2XL', 6),
  ('shirt_size', '3XL', 7)
on conflict (list_key, value) do nothing;

alter table option_lists enable row level security;

-- Public read: the registration form is served to anonymous visitors.
drop policy if exists option_lists_public_read on option_lists;
create policy option_lists_public_read on option_lists
  for select to anon, authenticated using (true);

-- Writes: PYH only, matching site_settings and nav_items. A cluster head
-- editing the province's shirt sizes is the same privilege break the RBAC
-- work closed everywhere else.
drop policy if exists option_lists_pyh_write on option_lists;
create policy option_lists_pyh_write on option_lists
  for all to authenticated
  using (is_pyh(auth.uid())) with check (is_pyh(auth.uid()));
