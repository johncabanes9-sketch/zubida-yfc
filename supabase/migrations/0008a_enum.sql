-- 0008a_enum.sql — add new admin_role enum values (separate transaction so they can be used by 0008b)
alter type admin_role add value if not exists 'provincial_youth_head';
alter type admin_role add value if not exists 'cluster_head';
