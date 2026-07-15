-- 0008b_admins_rbac.sql — two-tier RBAC on admins
alter table admins add column if not exists full_name text;
alter table admins add column if not exists username text;
alter table admins add column if not exists cluster_id uuid references clusters(id);
alter table admins add column if not exists is_active boolean not null default true;

create unique index if not exists admins_username_key
  on admins (lower(username)) where username is not null and deleted_at is null;

-- Promote the existing bootstrap admin(s) to PYH.
update admins set role = 'provincial_youth_head'
  where role in ('super_admin', 'provincial_admin');

-- is_admin: active, non-deleted admin only.
create or replace function is_admin(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from admins
    where user_id = uid and deleted_at is null and is_active = true
  );
$$;

create or replace function is_pyh(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from admins
    where user_id = uid and deleted_at is null and is_active = true
      and role = 'provincial_youth_head'
  );
$$;

create or replace function admin_cluster(uid uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select cluster_id from admins
  where user_id = uid and deleted_at is null and is_active = true
  limit 1;
$$;
