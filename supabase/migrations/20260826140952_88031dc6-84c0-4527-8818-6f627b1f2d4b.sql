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