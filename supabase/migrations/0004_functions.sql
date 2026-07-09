-- 0004_functions.sql

create or replace function check_rate_limit(
  p_ip text, p_endpoint text, p_window_seconds int, p_max int
) returns boolean
language plpgsql security definer set search_path = public as $$
declare recent int;
begin
  delete from rate_limits where created_at < now() - interval '1 hour';
  select count(*) into recent
    from rate_limits
    where ip = p_ip and endpoint = p_endpoint
      and created_at > now() - make_interval(secs => p_window_seconds);
  if recent >= p_max then
    return false;
  end if;
  insert into rate_limits (ip, endpoint) values (p_ip, p_endpoint);
  return true;
end $$;

create or replace function register_for_event(p jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_event_id uuid := (p->>'event_id')::uuid;
  v_claimed uuid;
  v_reg_code text;
  v_qr uuid := gen_random_uuid();
  v_ev events;
begin
  update events
    set slots_taken = slots_taken + 1
    where id = v_event_id
      and deleted_at is null
      and status = 'Open'
      and slots_taken < slots_total
      and now() < registration_deadline
    returning id into v_claimed;

  if v_claimed is null then
    select * into v_ev from events where id = v_event_id and deleted_at is null;
    if v_ev.id is null then
      return jsonb_build_object('ok', false, 'code', 'CLOSED');
    elsif v_ev.status <> 'Open' then
      return jsonb_build_object('ok', false, 'code', 'CLOSED');
    elsif now() >= v_ev.registration_deadline then
      return jsonb_build_object('ok', false, 'code', 'DEADLINE_PASSED');
    else
      return jsonb_build_object('ok', false, 'code', 'FULL');
    end if;
  end if;

  v_reg_code := 'ZYFC-' ||
    upper(substr(md5(gen_random_uuid()::text), 1, 4)) || '-' ||
    lpad((floor(random() * 9000) + 1000)::int::text, 4, '0');

  begin
    insert into event_registrations (
      registration_id, event_id, full_name, nickname, birthdate, age, gender,
      email, phone, chapter, cluster, parish, school, emergency_contact,
      emergency_number, medical_concerns, food_restrictions, shirt_size,
      transport_needed, consent, qr_token
    ) values (
      v_reg_code, v_event_id, p->>'full_name', p->>'nickname',
      nullif(p->>'birthdate','')::date, nullif(p->>'age','')::int, p->>'gender',
      p->>'email', p->>'phone', p->>'chapter', p->>'cluster', p->>'parish',
      p->>'school', p->>'emergency_contact', p->>'emergency_number',
      p->>'medical_concerns', p->>'food_restrictions', p->>'shirt_size',
      coalesce((p->>'transport_needed')::boolean, false),
      coalesce((p->>'consent')::boolean, false), v_qr
    );
  exception when unique_violation then
    update events set slots_taken = slots_taken - 1 where id = v_event_id;
    return jsonb_build_object('ok', false, 'code', 'DUPLICATE');
  end;

  return jsonb_build_object(
    'ok', true, 'registration_id', v_reg_code,
    'qr_token', v_qr, 'status', 'pending'
  );
end $$;

create or replace function check_registration(p_registration_id text, p_email text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when r.id is null then jsonb_build_object('found', false)
    else jsonb_build_object(
      'found', true,
      'registration_id', r.registration_id,
      'status', r.status,
      'full_name', r.full_name,
      'event_name', e.name,
      'event_date', e.date,
      'qr_token', r.qr_token
    ) end
  from (select 1) dummy
  left join event_registrations r
    on r.registration_id = p_registration_id
   and lower(r.email) = lower(trim(p_email))
   and r.deleted_at is null
  left join events e on e.id = r.event_id;
$$;

revoke all on function register_for_event(jsonb) from public;
revoke all on function check_registration(text, text) from public;
grant execute on function register_for_event(jsonb) to anon, authenticated;
grant execute on function check_registration(text, text) to anon, authenticated;
grant execute on function check_rate_limit(text, text, int, int) to anon, authenticated;
