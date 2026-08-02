## §7 — Revoked-list verification (revised)

Manual check by design. No scraper: a human records an outcome, the app keeps the record permanent and surfaces staleness.

### Correction 2 — what happens to a model unchecked for a year

With the 90-day dedupe as originally written: four identical reminders, twelve months apart in effect, each one indistinguishable from the first. Nothing in the message tells the reader the model is now a year stale, and the only place that shows is the panel's red band — which is only seen by someone who already opened the panel. So the answer is yes, four identical nudges and no escalation.

Fix in the message rather than in a second ladder: the reminder carries the age and the exposure, so its text escalates even though its frequency does not.

- Title: `Revoked-list check overdue — Samsara VG34 (unchecked 340 days, 12 trucks)`
- Body names the last check date (or "never checked since it was added on <date>"), the truck count, and the consequence: under 395.8(a)(1) an unregistered device is an out-of-service finding at roadside.
- Bands in the wording, matching how the malfunction rungs read: 91–120 days "overdue", 121–270 "well overdue", over 270 or never "no verification on record for this model in <N> days".
- Notification `priority` stays `action`; a revocation notification is the high-priority one. A stale check is a task, not an incident, and inflating it would erode the signal the revoked path needs.
- Dedupe stays 90 days per model, so a daily cron still produces one reminder per quarter.

### Correction 1 — banner condition

The banner keys on **a model whose latest check result is `revoked` and which has at least one assigned active `eld_devices` row**, with `eld_device_models.is_active` deliberately not in the predicate. Deactivating the model in the registry does not replace the hardware, and clearing a red banner is exactly what a stressed admin reaches for. When the fleet genuinely retires the model, the affected-truck count falls to zero and the banner clears on its own — a fact rather than a flag someone set. That reasoning goes in a comment above the query.

The same predicate drives the affected-truck list and countdown. The panel keeps showing a revoked-but-deactivated model with its trucks, flagged as deactivated-in-registry so the state is legible rather than hidden.

### Verified current state

- `eld_device_models` (6 rows): `provider_name`, `device_make`, `device_model`, `fmcsa_registration_id` (nullable), `support_phone`, `is_active`. Management-only writes, authenticated read. No check-history table exists.
- `eld_devices` links model → operator and `truck_number`, with `is_active` — the affected-truck join.
- `search_retention_archive` is the artifact registry: 7 `UNION ALL` arms today.
- `process-eld-escalations` evaluates open malfunction events, owns the `eld_cron_runs` ledger and the staff fan-out.
- Management views are a string union plus `ALLOWED_VIEWS` in `src/pages/management/ManagementPortal.tsx`.

### Data

New `eld_revoked_list_checks`, one row per model per check, append-only: `eld_device_model_id`, `checked_by`, `checked_at`, `result` (`registered | revoked | not_found`), `fmcsa_list_date`, `notes`, and on a revoked outcome `revocation_date` plus `replacement_deadline` (defaults to revocation + 60 days, editable — the grace period is set per revocation, not by regulation). `is_demo boolean not null default false`.

BEFORE UPDATE/DELETE triggers reject changes; a wrong entry is corrected by recording a new check.

Denormalized onto `eld_device_models`: `last_check_at`, `last_check_result`, `last_check_id`, `fmcsa_list_date`, `revocation_date`, `replacement_deadline`, written only by the recording function.

GRANTs and RLS: insert/select for management and owner, `service_role` full, no `anon`.

### Recording a check

One `SECURITY DEFINER` function authored from the copy target at the top of `docs/database-security-conventions.md` (`search_path = public, extensions`, `REVOKE ... FROM PUBLIC`, explicit `GRANT`), doing three things atomically: insert the check, update the denormalized status, and on `revoked` only, fan out one high-priority Management notification per staff recipient with entity `eld_device_model`.

A comment in the function body states that drivers are never notified and no malfunction event is opened on this path: a revocation is a fleet procurement decision, and wrongly telling twelve drivers to start manual logs would be its own incident.

`not_found` records amber with no notification — the recorded model number being wrong is the common cause.

### Device models panel

New `src/components/management/eld/ELDDeviceModelsPanel.tsx`; view `eld-device-models` added to the view union, `ALLOWED_VIEWS`, and the ELD nav group.

Columns: provider, make, model, FMCSA registration ID (blank is normal — not required on any federal document), assigned truck count, last check date, result, days since. Age colour gold 0–90, amber 91–120, red over 120 or never checked; a `revoked` result outranks the age colour and is always red.

Banner per the predicate above: model identifiers, revocation date, replacement deadline, every affected truck with a day countdown.

`RevokedListCheckModal.tsx`: opens FMCSA's registered and revoked lists in new tabs, shows this model's identifiers alongside for comparison, and requires an explicit outcome with nothing pre-selected. Fixed note: the ELD identifier the device reports in DOT Inspection mode is the authoritative value to match; a registration ID copied from a third-party site is not. On `revoked`, revocation date is required and the replacement deadline pre-fills to +60 days and stays editable.

### Archive

Eighth arm in `search_retention_archive`: `eld_revoked_list_check`, `log_date = checked_at::date`, label `Revoked-list check — <make> <model> (<result>)`, `operator_id NULL`. Fleet-level rather than per-driver, so the arm is emitted only when `_operator_ids`, `_truck`, and `_event_id` are all NULL — a driver- or truck-scoped search would otherwise drop it silently or attach it wrongly. Text-only, so the combined-PDF exporter lists it in the summary with no stored file to merge.

### Quarterly reminder

Inside `process-eld-escalations`, after the malfunction loop. Select active models whose `last_check_at` is null or older than 90 days, count assigned trucks excluding demo operators, and raise one Management notification per model carrying the age band, day count, and truck count as described above. Dedupe on an existing `eld_revoked_list_due` notification for that model within 90 days. Counts flow into the run-ledger result payload; `dryRun` and override runs behave as they do for escalations.

### Demo handling (§0.3)

Device models are fleet-level, so a check is never a demo artifact: `is_demo` is stamped false and demo runs record none. Demo operators are excluded from affected-truck counts and the banner list, and this path sends no email at all (in-app management notification only), so there is nothing for suppression to leak.

### Verification through the app

Record all three outcomes against real models and report: console state and colour for each, the notification produced or absent, the banner and countdown on the revoked path, that the banner survives setting `is_active = false` on the revoked model and only clears when the last assigned device is removed, the append-only rejection on an edit attempt, that no driver notification and no malfunction event were created, and one reminder pass plus a second showing dedupe and the age-carrying text. `npm run test:guards` in the same turn as the migration.
