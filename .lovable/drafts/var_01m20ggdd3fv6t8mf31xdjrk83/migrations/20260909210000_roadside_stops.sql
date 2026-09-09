-- Roadside stop log: DOT roadside inspections and traffic stops
-- Staff and operators can both record stops; operators see only their own.

create type public.roadside_stop_type as enum ('dot_inspection', 'traffic_stop');

create type public.roadside_stop_reason as enum (
  'random', 'weigh_station', 'moving_violation', 'equipment',
  'logs_hos', 'permit_credential', 'other'
);

create type public.roadside_stop_outcome as enum (
  'clean', 'warning', 'citation', 'violations_no_oos', 'out_of_service'
);

create type public.roadside_inspection_level as enum (
  'level_1', 'level_2', 'level_3', 'level_4', 'level_5', 'level_6'
);

create table public.roadside_stops (
  id                       uuid primary key default gen_random_uuid(),
  operator_id              uuid not null references public.operators(id) on delete cascade,
  driver_id                uuid,
  load_id                  uuid references public.loads(id) on delete set null,
  truck_unit_number        text,
  stop_at                  timestamptz not null,
  state                    text,
  location                 text,
  stop_type                public.roadside_stop_type not null,
  stop_reason              public.roadside_stop_reason not null default 'other',
  outcome                  public.roadside_stop_outcome not null default 'clean',
  inspection_report_number text,
  inspection_level         public.roadside_inspection_level,
  inspector_name           text,
  agency                   text,
  cvsa_sticker             boolean not null default false,
  oos_driver               boolean not null default false,
  oos_vehicle              boolean not null default false,
  citation_issued          boolean not null default false,
  fine_amount              numeric(10,2),
  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  created_by               uuid,
  updated_by               uuid
);

create index idx_roadside_stops_operator on public.roadside_stops (operator_id, stop_at desc);
create index idx_roadside_stops_load on public.roadside_stops (load_id);

create table public.roadside_stop_violations (
  id          uuid primary key default gen_random_uuid(),
  stop_id     uuid not null references public.roadside_stops(id) on delete cascade,
  code        text,
  description text,
  unit        text not null default 'vehicle',
  is_oos      boolean not null default false,
  created_at  timestamptz not null default now()
);

create index idx_roadside_stop_violations_stop on public.roadside_stop_violations (stop_id);

create table public.roadside_stop_documents (
  id          uuid primary key default gen_random_uuid(),
  stop_id     uuid not null references public.roadside_stops(id) on delete cascade,
  file_path   text not null,
  file_name   text,
  file_url    text,
  uploaded_by uuid,
  uploaded_at timestamptz not null default now()
);

create index idx_roadside_stop_documents_stop on public.roadside_stop_documents (stop_id);

grant select, insert, update, delete on public.roadside_stops to authenticated;
grant all on public.roadside_stops to service_role;
grant select, insert, update, delete on public.roadside_stop_violations to authenticated;
grant all on public.roadside_stop_violations to service_role;
grant select, insert, update, delete on public.roadside_stop_documents to authenticated;
grant all on public.roadside_stop_documents to service_role;

alter table public.roadside_stops enable row level security;
alter table public.roadside_stop_violations enable row level security;
alter table public.roadside_stop_documents enable row level security;

-- Helper: is this operator record owned by the current user?
create or replace function public.is_own_operator(_operator_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.operators o
    where o.id = _operator_id and o.user_id = auth.uid()
  )
$$;

revoke all on function public.is_own_operator(uuid) from public, anon;
grant execute on function public.is_own_operator(uuid) to authenticated, service_role;

-- roadside_stops policies
create policy "Staff manage roadside stops"
  on public.roadside_stops for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

create policy "Operators view their own roadside stops"
  on public.roadside_stops for select to authenticated
  using (public.is_own_operator(operator_id));

create policy "Operators log their own roadside stops"
  on public.roadside_stops for insert to authenticated
  with check (public.is_own_operator(operator_id) and created_by = auth.uid());

create policy "Operators correct their recent roadside stops"
  on public.roadside_stops for update to authenticated
  using (
    public.is_own_operator(operator_id)
    and created_by = auth.uid()
    and created_at > now() - interval '24 hours'
  )
  with check (public.is_own_operator(operator_id));

-- child tables inherit access from the parent stop
create policy "Roadside violations follow the stop"
  on public.roadside_stop_violations for all to authenticated
  using (
    exists (
      select 1 from public.roadside_stops s
      where s.id = stop_id
        and (public.is_staff(auth.uid()) or public.is_own_operator(s.operator_id))
    )
  )
  with check (
    exists (
      select 1 from public.roadside_stops s
      where s.id = stop_id
        and (public.is_staff(auth.uid()) or public.is_own_operator(s.operator_id))
    )
  );

create policy "Roadside documents follow the stop"
  on public.roadside_stop_documents for all to authenticated
  using (
    exists (
      select 1 from public.roadside_stops s
      where s.id = stop_id
        and (public.is_staff(auth.uid()) or public.is_own_operator(s.operator_id))
    )
  )
  with check (
    exists (
      select 1 from public.roadside_stops s
      where s.id = stop_id
        and (public.is_staff(auth.uid()) or public.is_own_operator(s.operator_id))
    )
  );

-- Attribution + updated_at
create or replace function public.stamp_roadside_stop()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
    new.updated_by := coalesce(new.updated_by, auth.uid());
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_by := auth.uid();
    new.updated_at := now();
  end if;
  return new;
end;
$$;

revoke all on function public.stamp_roadside_stop() from public, anon;

create trigger trg_stamp_roadside_stop
  before insert or update on public.roadside_stops
  for each row execute function public.stamp_roadside_stop();

-- Audit trail
create or replace function public.audit_roadside_stop()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.roadside_stops;
  v_action text;
begin
  if tg_op = 'DELETE' then
    v_row := old;
    v_action := 'roadside_stop_deleted';
  elsif tg_op = 'UPDATE' then
    v_row := new;
    v_action := 'roadside_stop_updated';
  else
    v_row := new;
    v_action := 'roadside_stop_logged';
  end if;

  insert into public.audit_log (actor_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
  values (
    auth.uid(),
    public._audit_actor_name(auth.uid()),
    v_action,
    'roadside_stop',
    v_row.id,
    coalesce(v_row.location, v_row.state, 'Roadside stop'),
    jsonb_build_object(
      'operator_id', v_row.operator_id,
      'stop_at', v_row.stop_at,
      'stop_type', v_row.stop_type,
      'stop_reason', v_row.stop_reason,
      'outcome', v_row.outcome,
      'inspection_report_number', v_row.inspection_report_number,
      'oos_driver', v_row.oos_driver,
      'oos_vehicle', v_row.oos_vehicle
    )
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.audit_roadside_stop() from public, anon;

create trigger trg_audit_roadside_stop
  after insert or update or delete on public.roadside_stops
  for each row execute function public.audit_roadside_stop();
