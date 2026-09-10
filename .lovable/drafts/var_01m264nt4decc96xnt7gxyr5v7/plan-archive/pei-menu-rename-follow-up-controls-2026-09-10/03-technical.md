## Technical detail

**Rename** — `src/pages/management/ManagementPortal.tsx:1045`: label `Previous Employer Checks` → `PEI`. Route key `pei-queue` unchanged, so links and help-index entries keep working. Staff/Deactivation nav items keep `PEI Queue`.

**Settings storage** (staged additive migration under the draft's migrations folder, applied on accept):

```sql
create table public.pei_cadence_settings (
  id boolean primary key default true check (id),   -- single row
  auto_follow_ups_enabled boolean not null default true,
  follow_up_interval_days int not null default 5 check (follow_up_interval_days between 1 and 15),
  gfe_after_days int not null default 30 check (gfe_after_days between 7 and 60),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check (gfe_after_days > follow_up_interval_days)
);
grant select on public.pei_cadence_settings to authenticated;
grant all on public.pei_cadence_settings to service_role;
alter table public.pei_cadence_settings enable row level security;
-- select: staff roles; writes only via the definer function below
insert into public.pei_cadence_settings (id) values (true) on conflict do nothing;
```

Writer `public.set_pei_cadence_settings(boolean, int, int, text)` — SECURITY DEFINER, `set search_path to 'public','extensions'`, authorizes management/owner via `has_role`, validates the bounds, stamps `updated_by = auth.uid()`, writes an `audit_log` row, `revoke all ... from public, anon`, grant execute to `authenticated, service_role`. Registered in the definer allowlist with justification.

Per-employer pause reuses `pei_requests.auto_paused_reason` with a new value `'staff_paused'`; a protected writer `set_pei_request_auto_pause(uuid, boolean, text)` (same authorization/audit pattern) sets or clears it. The cadence function already skips rows with a non-null `auto_paused_reason`, so no branch is added there.

**Edge function** `supabase/functions/pei-auto-cadence/index.ts`: replace the module constants `MILESTONES` / `GFE_DAY`. Read the settings row first; exit early with `{skipped: 'disabled'}` when `auto_follow_ups_enabled` is false. Compute milestones as `interval, 2*interval, …` while `< gfe_after_days`; `dueCount` and the `auto_send_count` gate stay as they are, so already-sent milestones are never re-sent. Idempotency key becomes `pei-<id>-auto-day<milestoneDay>` as today.

**UI** — `src/components/pei/` gains a `PEICadenceSettingsCard` (switch + two number inputs + Save, management/owner only, disabled otherwise) rendered in the PEI queue header area of the Management page and the Staff PEI queue. Each employer card in `ApplicationPEITab` and the queue rows get a pause/resume action; the existing auto-paused badge maps `staff_paused` → "PAUSED BY STAFF", `suppressed` → current text.

**Tests** — pure milestone helper extracted (`peiCadence.ts`: `milestonesFor(interval, gfeDay)`) with unit tests for default 5/30, a 7/30 case, disabled state, and the `gfe_after_days > interval` guard.
