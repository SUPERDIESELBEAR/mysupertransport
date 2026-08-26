-- The rate con ingest queue is a shared queue nobody watches: inserts from the
-- ingest function and status transitions must reach open clients live. The app
-- already subscribes via postgres_changes, but the table was never added to the
-- realtime publication, so no events were delivered and Refresh was the only
-- way to see current state.
alter table public.rate_con_ingest_queue replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_rel pr
    join pg_publication p on p.oid = pr.prpubid
    join pg_class c on c.oid = pr.prrelid
    where p.pubname = 'supabase_realtime'
      and c.relname = 'rate_con_ingest_queue'
  ) then
    alter publication supabase_realtime add table public.rate_con_ingest_queue;
  end if;
end $$;
