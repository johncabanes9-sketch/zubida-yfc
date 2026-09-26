-- 0031_contact_messages.sql — the provincial office's contact inbox.
--
-- Until now the /contact form stored nothing: it showed "Message received"
-- after a timer and dropped the message. Rows are written only by
-- /api/contact, through the service role, after captcha and rate limiting.
-- This migration seeds nothing.

create table if not exists contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (char_length(email) between 3 and 160),
  subject text check (subject is null or char_length(subject) between 1 and 200),
  message text not null check (char_length(message) between 10 and 5000),
  status text not null default 'new' check (status in ('new', 'read', 'archived')),
  read_by uuid references auth.users(id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contact_messages_inbox_idx
  on contact_messages (status, created_at desc);

alter table contact_messages enable row level security;

-- No anon policy of any kind. A public insert policy would let anyone post
-- straight to PostgREST with the anon key, skipping the route's captcha and
-- rate limit; the service role needs no policy.

-- Messages are addressed to the provincial office, so only the PYH reads
-- them. Cluster heads get nothing — no policy means RLS denies.
drop policy if exists contact_messages_pyh_read on contact_messages;
create policy contact_messages_pyh_read on contact_messages
  for select to authenticated
  using (is_pyh(auth.uid()));

drop policy if exists contact_messages_pyh_update on contact_messages;
create policy contact_messages_pyh_update on contact_messages
  for update to authenticated
  using (is_pyh(auth.uid()))
  with check (is_pyh(auth.uid()));

-- The PYH triages a message, never edits it: what a sender wrote stays as
-- they wrote it. Column grants narrow UPDATE to the triage columns, which the
-- row policy above cannot do on its own. There is no DELETE policy — archive
-- instead.
revoke insert, update, delete on contact_messages from anon, authenticated;
grant update (status, read_by, read_at) on contact_messages to authenticated;

drop trigger if exists contact_messages_set_updated_at on contact_messages;
create trigger contact_messages_set_updated_at
  before update on contact_messages
  for each row execute function set_updated_at();
