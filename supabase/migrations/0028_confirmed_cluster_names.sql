-- Rename the clusters to the organization's actual three.
--
-- 0007 seeded `clusters` with the distinct cluster names appearing in the
-- Phase-1 chapter fixtures (src/data/chapters.ts):
--
--   Bay Cluster / bay
--   North Cluster / north
--   South Cluster / south
--
-- Those were invented alongside the fixtures — the chapters task-4 report says
-- so in as many words. The organization's clusters are Central, East and West.
--
-- This one was not confined to a fixture file. `chapters.cluster_id`,
-- `leaders.cluster_id`, `events.cluster_id` and `admins.cluster_id` all point
-- here, so the invented names were the labels on every cluster dropdown in
-- /admin, and the badge on every published chapter card.
--
-- Renaming the rows rather than replacing them is deliberate: the ids do not
-- move, so every foreign key, every cluster head's assignment and every event
-- already scoped to a cluster survives untouched. Deleting and re-inserting
-- would orphan all of it.
--
-- WHICH OLD NAME BECOMES WHICH NEW ONE IS ARBITRARY. The old names were
-- invented, so there is no fact of the matter about whether "North Cluster"
-- was really East or West; the pairing below is seed order. What each cluster
-- CONTAINS is therefore still unverified — any chapter, leader or event
-- attached to a cluster keeps that attachment through this migration, and
-- those assignments came from the same invented fixtures. They need reviewing
-- in /admin against reality.
--
-- Each statement is guarded on the exact invented name, so a cluster an
-- administrator has already renamed is never touched, and re-running this
-- migration cannot rename anything twice.

update clusters set name = 'Central Cluster', slug = 'central'
where name = 'Bay Cluster';

update clusters set name = 'East Cluster', slug = 'east'
where name = 'North Cluster';

update clusters set name = 'West Cluster', slug = 'west'
where name = 'South Cluster';
