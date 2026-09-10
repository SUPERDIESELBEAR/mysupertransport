-- Duplicate protection for Inspection Binder documents.
-- Additive only: one new nullable column, one index, one INSERT guard trigger.
-- Existing duplicate rows are left untouched (a unique index would reject them);
-- the guard only prevents NEW duplicate slots from being created.

alter table public.inspection_documents
  add column if not exists content_hash text;

comment on column public.inspection_documents.content_hash is
  'SHA-256 hex digest of the stored file bytes, calculated client-side before upload. '
  'Used to recognise the same document re-uploaded under a different file name.';

create index if not exists idx_inspection_documents_driver_name_hash
  on public.inspection_documents (driver_id, name, content_hash);

-- One live document per slot: a second row for the same (scope, driver, name)
-- must not be inserted. Replacements go through UPDATE, which archives the
-- outgoing file via trg_archive_inspection_document_version.
create or replace function public.enforce_single_live_binder_document()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_existing uuid;
begin
  select id into v_existing
  from public.inspection_documents
  where name = new.name
    and scope = new.scope
    and driver_id is not distinct from new.driver_id
    and id is distinct from new.id
  limit 1;

  if v_existing is not null then
    raise exception
      'A % document already exists for this slot (id %). Replace it instead of adding a second copy.',
      new.name, v_existing
      using errcode = '23505';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_single_live_binder_document() from public, anon, authenticated;

drop trigger if exists trg_single_live_binder_document on public.inspection_documents;
create trigger trg_single_live_binder_document
  before insert on public.inspection_documents
  for each row execute function public.enforce_single_live_binder_document();