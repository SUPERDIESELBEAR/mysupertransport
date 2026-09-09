-- Binder document version history + DOT sync repair
create table public.inspection_document_versions (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.inspection_documents(id) on delete cascade,
  version     integer not null,
  file_path   text,
  file_url    text,
  expires_at  date,
  uploaded_by uuid,
  uploaded_at timestamptz not null default now(),
  source      text,
  created_at  timestamptz not null default now(),
  unique (document_id, version)
);

create index idx_inspection_document_versions_document_id
  on public.inspection_document_versions (document_id);

grant select, insert on public.inspection_document_versions to authenticated;
grant all on public.inspection_document_versions to service_role;

alter table public.inspection_document_versions enable row level security;

create policy "Staff can manage inspection document versions"
  on public.inspection_document_versions
  for all
  to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

create policy "Operators can view their own document versions"
  on public.inspection_document_versions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.inspection_documents d
      where d.id = document_id
        and (
          d.scope = 'company_wide'
          or (d.scope = 'per_driver' and d.driver_id = auth.uid())
        )
    )
  );

-- Append-only: no update/delete policies; enforce with an immutability trigger
create or replace function public.enforce_inspection_document_versions_immutability()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
begin
  raise exception 'inspection_document_versions rows are immutable';
end;
$$;

create trigger trg_inspection_document_versions_immutable
  before update or delete on public.inspection_document_versions
  for each row execute function public.enforce_inspection_document_versions_immutability();

-- Archive the outgoing file whenever a binder document's file changes
create or replace function public.archive_inspection_document_version()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_next integer;
begin
  if (new.file_path is distinct from old.file_path or new.file_url is distinct from old.file_url)
     and (old.file_path is not null or old.file_url is not null) then
    select coalesce(max(version), 0) + 1 into v_next
    from public.inspection_document_versions
    where document_id = old.id;

    insert into public.inspection_document_versions (
      document_id, version, file_path, file_url, expires_at, uploaded_by, uploaded_at, source
    ) values (
      old.id, v_next, old.file_path, old.file_url, old.expires_at, old.uploaded_by,
      coalesce(old.uploaded_at, now()), 'replaced'
    );
  end if;
  return new;
end;
$$;

create trigger trg_archive_inspection_document_version
  before update on public.inspection_documents
  for each row execute function public.archive_inspection_document_version();

-- Fixed DOT -> binder sync: unprefixed path, link and location always replaced together
create or replace function public.sync_dot_to_inspection_documents()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_user_id      uuid;
  v_existing_id  uuid;
  v_latest_date  date;
begin
  if current_setting('app.skip_dot_sync', true) = 'on' then
    return new;
  end if;

  select user_id into v_user_id
  from public.operators
  where id = new.operator_id;

  if v_user_id is null then return new; end if;

  select max(inspection_date) into v_latest_date
  from public.truck_dot_inspections
  where operator_id = new.operator_id;

  if new.inspection_date < coalesce(v_latest_date, new.inspection_date) then
    return new;
  end if;

  select id into v_existing_id
  from public.inspection_documents
  where driver_id = v_user_id
    and name = 'Periodic DOT Inspections'
    and scope = 'per_driver'
  order by uploaded_at desc
  limit 1;

  perform set_config('app.skip_doc_sync', 'on', true);

  if v_existing_id is null then
    insert into public.inspection_documents (
      name, scope, driver_id, file_url, file_path, expires_at, uploaded_by
    ) values (
      'Periodic DOT Inspections', 'per_driver', v_user_id,
      new.certificate_file_url, new.certificate_file_path, new.inspection_date, new.created_by
    );
  else
    update public.inspection_documents
    set file_url    = new.certificate_file_url,
        file_path   = coalesce(new.certificate_file_path, file_path),
        expires_at  = new.inspection_date,
        updated_at  = now(),
        uploaded_by = coalesce(new.created_by, uploaded_by)
    where id = v_existing_id;
  end if;

  perform set_config('app.skip_doc_sync', 'off', true);

  return new;
end;
$$;

revoke all on function public.enforce_inspection_document_versions_immutability() from public, anon;
revoke all on function public.archive_inspection_document_version() from public, anon;