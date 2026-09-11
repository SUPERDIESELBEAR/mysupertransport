## Technical notes

### Schema (additive migrations, staged — apply on draft accept)

- `inspection_cycles`: `id`, `truck_id` (FK truck records), `operator_id`, `cycle_year int`, `cycle_month int`, `assigned_group text` (derived, stored for audit), `status` enum (`upcoming, due, submitted, closed, overdue, grace`), `inspection_id` FK → `truck_dot_inspections`, `report_file_path`, `invoice_file_path`, `inspection_fee numeric`, `billed_to_company_account bool`, `defects_identified bool`, `defects_repaired bool`, `defect_notes text`, `grace_until date`, `grace_requested_by uuid`, `submitted_at`, `closed_at`, standard audit columns. Unique `(truck_id, cycle_year, cycle_month)`.
- `inspection_program_payments`: `id`, `kind` enum (`inspection_reimbursement, roadside_bonus`), `cycle_id` FK nullable, `roadside_stop_id` FK nullable, `operator_id`, `amount numeric`, `status` enum (`pending, approved, rejected, settled`), `reviewed_by`, `reviewed_at`, `settlement_id` FK nullable, `review_note text`, audit columns.
- `roadside_stops` gains: `bonus_eligible bool`, `bonus_amount numeric`, `report_submitted_at timestamptz` (for the 24-hour check). Additive columns only.
- Grace limit: `inspection_cycles` also carries `grace_granted_at timestamptz`, `grace_reason text`, `grace_is_override bool`, `grace_override_by uuid`. The allowance lives in a program settings row (`max_grace_per_12_months`, default 2) alongside the $150 reimbursement cap and bonus amounts — configurable per the SaaS rule, never hard-coded. A `grant_inspection_grace(cycle_id, days, reason, override bool)` RPC counts prior grants for that operator over the trailing 12 months and refuses a non-override grant past the allowance; overrides require a management role and a non-empty reason, and both paths write to `audit_log`.
- Every table: GRANTs (authenticated + service_role, no anon), `ENABLE ROW LEVEL SECURITY`, staff-only write policies, operators read only their own rows. Audit triggers matching existing patterns. All new SECURITY DEFINER functions pinned `SET search_path = public, extensions` with explicit revokes, per the security conventions.

### Logic placement

- Group assignment: pure function `inspectionGroup(unitNumber)` in `src/lib` — last digit parity, 0 = even. Unit-tested.
- Cycle status: computed by a DB view or RPC so Vehicle Hub, Dispatch Board badge, and the summary all read one definition (per the standing rule: one definition, live-inspected).
- Cycle generation: lazily created per unit when the current assigned month begins (scheduled job on the existing cron pattern), plus backfill for the launch credit.
- Reminders: scheduled task alongside the existing 15:00 UTC cron; skips submitted/closed cycles.
- Settlement handoff: the queue's Approve inserts a settlement line item through the existing settlement engine path — never a direct write the engine doesn't own.

### UI

- Vehicle Hub detail: new "Quarterly Inspections" panel (current cycle card + history list), reusing `FilePreviewModal` and existing upload components.
- Dispatch Board: overdue badge chip on the unit, tooltip explains why.
- Management: "Inspection Program" view — review queue tabs, fleet summary, per-group completion.
- Roadside stop modal: auto-computed bonus hint when outcome = clean and level is I/II/III; staff confirm, nothing auto-pays.
- Inspection-level descriptions: a shared collapsible `InspectionLevelGuide` component fed from constants in `src/components/drivers/roadsideStopTypes.ts` (extends the existing `INSPECTION_LEVELS` list with a `description` field), rendered in the roadside stop modal, the review queue, and the operator's read-only roadside list.

### Out of scope (deliberately)

- Driver self-upload from the Operator Portal (staff-upload pattern chosen).
- Email ingest of the inspections@ mailbox (manual staff upload for now).
- Hard dispatch blocking (badge is advisory per your answer).
- Live FMCSA/CSA data feeds (manual fields on the monthly summary).

### Verification

- Unit tests for group derivation and cycle status transitions.
- Drive the preview: create a cycle, upload submission, verify badge appears on month expiry (simulated date), approve a reimbursement to settlement, log a clean Level II stop and confirm the bonus flag.
- Structural suites: `definer-live-catalog`, `definer-search-path`, `grant-parity-live`, `function-reachability`, `tsgo`.
