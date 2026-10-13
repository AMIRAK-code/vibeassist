-- An index for handoff_links.user_id: the owner's read policy filters on it, and deleting an
-- account cascades through it. Flagged by the performance advisor as an unindexed foreign key.
create index handoff_links_user_idx on public.handoff_links (user_id);

-- Rollback:
-- drop index public.handoff_links_user_idx;
