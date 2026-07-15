-- 0007_clusters.sql — canonical clusters
create table if not exists clusters (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  created_at timestamptz not null default now()
);

-- Seed from the cluster names used across chapters (idempotent).
insert into clusters (name, slug) values
  ('Bay Cluster', 'bay'),
  ('North Cluster', 'north'),
  ('South Cluster', 'south')
on conflict (name) do nothing;
