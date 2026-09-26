-- 0032_check_in.sql — venue check-in against the QR pass.
--
-- Every pass carries a QR of its /registration-status link (registration code
-- + qr_token). Until now nothing read it at the door. This adds the check-in
-- stamp and one function that applies it.

alter table event_registrations
  add column if not exists checked_in_at timestamptz,
  add column if not exists checked_in_by uuid references auth.users(id) on delete set null,
  add column if not exists check_in_method text;

-- A stamp is whole or absent: a time with no method (or the reverse) would
-- make the attendance count and the audit trail disagree.
alter table event_registrations drop constraint if exists event_registrations_check_in_consistent;
alter table event_registrations add constraint event_registrations_check_in_consistent check (
  (checked_in_at is null and check_in_method is null)
  or (checked_in_at is not null and check_in_method in ('qr', 'manual'))
);

create index if not exists event_registrations_checked_in_idx
  on event_registrations (event_id, checked_in_at desc)
  where checked_in_at is not null and deleted_at is null;

-- SECURITY INVOKER, deliberately. The caller's RLS decides what they can see
-- and stamp: registrations_admin_read/_update (0010) already scope a cluster
-- head to their own cluster's events, and the PYH to all. A registration the
-- caller cannot see is simply NOT_FOUND, so this function grants nothing the
-- policies do not.
--
-- The stamp is one conditional UPDATE (`checked_in_at is null`), so two doors
-- scanning the same pass at once admit it once: the second waits on the row
-- lock, re-evaluates the condition, updates nothing, and reports ALREADY.
create or replace function check_in_registration(p_event_id uuid, p_code text, p_token uuid default null)
returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_code text := upper(trim(p_code));
  r event_registrations;
  v_stamped timestamptz;
begin
  if auth.uid() is null or not is_admin(auth.uid()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select * into r from event_registrations
    where registration_id = v_code and deleted_at is null;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if r.event_id <> p_event_id then
    return jsonb_build_object('ok', false, 'code', 'WRONG_EVENT');
  end if;
  if p_token is not null and r.qr_token <> p_token then
    return jsonb_build_object('ok', false, 'code', 'BAD_TOKEN');
  end if;
  -- Pending and approved both hold a slot (0020), so both may enter; the door
  -- sees the status and can act on a pending one.
  if r.status not in ('pending', 'approved') then
    return jsonb_build_object('ok', false, 'code', 'NOT_ELIGIBLE',
      'registration', jsonb_build_object('full_name', r.full_name, 'status', r.status));
  end if;

  update event_registrations
     set checked_in_at = now(),
         checked_in_by = auth.uid(),
         check_in_method = case when p_token is null then 'manual' else 'qr' end
   where id = r.id and checked_in_at is null
   returning checked_in_at into v_stamped;

  if v_stamped is null then
    select * into r from event_registrations where id = r.id;
  end if;

  return jsonb_build_object(
    'ok', v_stamped is not null,
    'code', case when v_stamped is not null then 'CHECKED_IN' else 'ALREADY' end,
    'registration', jsonb_build_object(
      'id', r.id,
      'registration_id', r.registration_id,
      'full_name', r.full_name,
      'chapter', r.chapter,
      'status', r.status,
      'checked_in_at', coalesce(v_stamped, r.checked_in_at)
    )
  );
end;
$$;

revoke all on function check_in_registration(uuid, text, uuid) from public, anon;
grant execute on function check_in_registration(uuid, text, uuid) to authenticated;
