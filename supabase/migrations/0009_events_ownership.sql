-- 0009_events_ownership.sql — event ownership + cluster scoping
alter table events add column if not exists created_by uuid references auth.users(id);
alter table events add column if not exists cluster_id uuid references clusters(id);

create index if not exists events_cluster_idx on events (cluster_id) where deleted_at is null;
create index if not exists events_created_by_idx on events (created_by) where deleted_at is null;
