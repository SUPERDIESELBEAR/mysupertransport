# Technical details

## Schema (staged additive migration)

New enums: `roadside_stop_type` (dot_inspection, traffic_stop), `roadside_stop_reason` (random, weigh_station, moving_violation, equipment, logs_hos, permit_credential, other), `roadside_stop_outcome` (clean, warning, citation, violations_no_oos, out_of_service), `roadside_inspection_level` (level_1 … level_6).

`public.roadside_stops`
- `id uuid pk`, `operator_id` FK `operators`, `driver_id` (profile) nullable, `load_id` FK `loads` nullable, `truck_unit_number text`
- `stop_at timestamptz not null`, `state text`, `location text`, `stop_type`, `stop_reason`, `outcome`
- `inspection_report_number text`, `inspection_level`, `inspector_name text`, `agency text`, `cvsa_sticker boolean default false`
- `oos_driver boolean default false`, `oos_vehicle boolean default false`, `citation_issued boolean`, `fine_amount numeric`, `notes text`
- `created_at/updated_at/created_by/updated_by`
- indexes on `operator_id, stop_at desc`, `load_id`

`public.roadside_stop_violations` — `stop_id` FK cascade, `code text`, `description text`, `is_oos boolean`, `unit text` (driver/vehicle).

`public.roadside_stop_documents` — `stop_id` FK cascade, `file_path`, `file_name`, `file_url`, `uploaded_by`, `uploaded_at`. Files go to the existing `driver-uploads` bucket under `roadside/<operator_id>/<stop_id>/`.

Each `CREATE TABLE` is followed in the same migration by GRANTs (`select, insert, update, delete` to `authenticated`; `all` to `service_role`; no `anon`), then `ENABLE ROW LEVEL SECURITY`, then policies.

## RLS

- Staff (dispatcher, onboarding_staff, management, owner via `has_role`): full read/write.
- Operator: `select` and `insert` on rows where `operator_id` matches their own operator record; `update` only on rows they created and only while unreviewed-free — simplest form: operators may update their own rows within 24h of creation. No delete for operators.
- Child tables inherit via `exists` on the parent stop.
- Explicit `revoke all on function ... from public, anon` for any new function.

## Audit

Insert/update/delete trigger writing to `audit_log` with actor attribution, matching existing table patterns (`_audit_actor_name`).

## Frontend

- `src/components/staff/RoadsideStopsCard.tsx` — history list, 12-month summary chips (stops, OOS, clean inspections), Add Stop.
- `src/components/staff/RoadsideStopModal.tsx` — form; inspection-only fields (report number, level, CVSA) reveal when type is DOT inspection; violation rows repeatable; file attach.
- Hooks `src/hooks/useRoadsideStops.ts` (React Query, realtime).
- Mount the card in the Driver Hub driver profile and in Vehicle Hub filtered by unit.
- Operator portal: read-only list plus a Report a Stop sheet reusing the same modal in operator mode.

## Notes

- Existing `driver_uploads.category = 'roadside_inspection_report'` stays; the review screen gains an optional "attach to a roadside stop" action so past uploads can be linked.
- Migration is staged under the draft's migrations folder and applies when the draft is accepted; the new tables do not exist in the draft until then.
