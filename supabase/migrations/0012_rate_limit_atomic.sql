-- Fix TOCTOU race in check_rate_limit.
--
-- The original counted rows and then inserted with no guard between the two
-- steps, so concurrent calls for the same IP could each observe a count below
-- the cap and all insert, admitting more than p_max requests per window.
--
-- A transaction-scoped advisory lock keyed on (ip, endpoint) serialises callers
-- that share a bucket while letting different IPs proceed in parallel. The lock
-- is released when the enclosing statement's transaction ends.

create or replace function check_rate_limit(
  p_ip text, p_endpoint text, p_window_seconds int, p_max int
) returns boolean
language plpgsql security definer set search_path = public as $$
declare recent int;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_ip || ':' || p_endpoint, 0));

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

grant execute on function check_rate_limit(text, text, int, int) to anon, authenticated;
