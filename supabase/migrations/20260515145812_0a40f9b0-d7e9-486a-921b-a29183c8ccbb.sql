create table public.revert_courtesy_email_defaults (
  role public.app_role primary key,
  send_by_default boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.revert_courtesy_email_defaults enable row level security;

create policy "Staff can read revert courtesy defaults"
  on public.revert_courtesy_email_defaults
  for select
  using (public.is_staff(auth.uid()));

create policy "Management can manage revert courtesy defaults"
  on public.revert_courtesy_email_defaults
  for all
  using (public.has_role(auth.uid(), 'management'::public.app_role) or public.has_role(auth.uid(), 'owner'::public.app_role))
  with check (public.has_role(auth.uid(), 'management'::public.app_role) or public.has_role(auth.uid(), 'owner'::public.app_role));

insert into public.revert_courtesy_email_defaults (role, send_by_default) values
  ('owner', true),
  ('management', true),
  ('onboarding_staff', false),
  ('dispatcher', false)
on conflict (role) do nothing;