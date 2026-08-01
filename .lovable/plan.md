## Both corrections taken

### 1. `certify_rods_day` rejects placeholder names server-side

The client-side hard-fail in the certify modal is necessary but not the guard. The server's 12-field header check tests non-empty, not real — so any caller supplying `"Driver"` certifies a §395.8 record in a false name and passes every check. Same shape as the `record_source` bypass.

Add to `certify_rods_day`, alongside the existing header validation:

- Reject when `btrim(certification_legal_name)` is empty, or when `lower(btrim(...))` is in the placeholder set: `driver`, `unknown`, `operator`, `n/a`, `unnamed`, `test driver`. Own SQLSTATE (`ELD07`), distinct message naming the offending value.
- Register `ELD07` in `REJECTION_SQLSTATES` so the client renders it as a rejection rather than an unknown 500.
- No privileged exemption — no `rods.privileged` bypass, same as `is_override`.

Order of work is observation before assertion: apply the migration, drive a real certify attempt over the wire with `certification_legal_name = 'Driver'`, capture the actual SQLSTATE and message the client receives, and only then write the fixture asserting it. A fixture written first would assert what I assumed the wire returns.

This cannot catch every wrong name. It makes the one the codebase actually produces — the `|| 'Driver'` fallback — structurally unable to reach a federal record, from any path, client or server.

### 2. Triage of the 43 zero-argument `.maybeSingle()` calls

Sized rather than deferred. Three buckets.

**Fix now — null yields a placeholder on a driver-facing or compliance artifact (6)**

| Site | Null path produces |
|---|---|
| `certifyRodsDay` caller / certify modal | `certification_legal_name = 'Driver'` on a §395.8 record |
| `send-eld-malfunction-notice:147` | `'Driver'` on the 395.34(a)(1) written notice |
| `send-officer-packet:224` | `'Driver'` + null unit on the roadside packet (broken `profiles(...)` embed, error swallowed) |
| `buildOfficerPacket.ts:221` | `'Driver'` drawn into the packet PDF |
| `send-return-receipt-pdf:100` | `'Driver'` on the equipment-return receipt the driver signs |
| `send-lease-termination:114` | `'Driver'` on the termination document |

All six become hard failures: resolve the name or refuse to produce the artifact, with the reason stamped where the caller can see it.

**Accept, noted — UI or courtesy default, no record consequence (20)**

Sender/staff-name fallbacks (`'Staff'`, `'SUPERTRANSPORT Management'`, `'SUPERTRANSPORT Operations'`, caller-email fallbacks) in `invite-staff`, `invite-operator`, `invite-applicant`, `request-application-revisions`, `send-dot-consultant-request`, `send-insurance-request`, `send-deactivation-notice`, `send-return-receipt-pdf` (sender line), `send-equipment-return-instructions`; greeting-only `'Driver'` in `send-cert-reminder`, `send-payroll-docs`, `send-birthday-anniversary`, `cron-cert-reminders`, `check-cert-expiry`, `check-inspection-expiry`, `send-staff-birthday-message`, `send-test-email`, the passenger-auth template; `'Dispatcher'` / `'Coordinator'` in `OperatorPortal`; `'Unknown Operator'` in `OperatorDetailPanel`. A degraded greeting on a reminder email is not a false entry on a record. Two of these still get their wrong-column bug fixed (`send-test-email:78`, `send-equipment-return-instructions:69` both key `profiles` on `id` instead of `user_id`) — the fallback stays, the lookup stops being broken.

**Genuine optional read — null is a real, meaningful state (17)**

Settings singletons (`insurance_email_settings`, `dot_consultant_email_settings`, `carrier_profile`), existence probes (`invite-operator` existing-operator check, `handle-email-unsubscribe` token, `email-track-open`), offline hydrate reads, `equipmentSync`, `truckSync`, `syncInspectionBinderDate`, `useIsDemoOperator`, `OperatorPortal` prefetches, `set-demo-flag`, `send-transactional-email` template/registry reads. These branch on null deliberately.

That's the list, with a length: **6 fix now, 20 accepted and named, 17 correct as written.**

## Carried forward from the approved plan

- **`eld_cron_runs`** — one row per invocation written in a `finally`: `effective_date`, `trigger_source`, `is_override`, `events_evaluated`, `ledger_rows_inserted`, `emails_sent`, `status`, `error_text`, `_result` jsonb. SELECT for management and owner; no INSERT/UPDATE/DELETE policy for any role; GRANT SELECT to `authenticated`, ALL to `service_role`. Permanent, not verification scaffolding — ten-minute log retention applies to every scheduled job.
- **Relax to `'0 * * * *'` only after** a scheduled `*/10` invocation has left a row with `status: succeeded` and a readable quiet signature (`events_evaluated: N, ledger_rows_inserted: 0, emails_sent: 0`).
- **`send-officer-packet` embed fix** — second read on `profiles` keyed by `operators.user_id`, error checked rather than swallowed.
- **`APP_URL`** — set to the published origin this turn; confirm the `[app-url]` warning stops, so a future warning means a regression.

## Verification

1. A certify attempt with `certification_legal_name = 'Driver'` is rejected over the wire with `ELD07`, observed before the fixture is written; the day stays uncertified.
2. `ELD07` renders as a rejection in the modal, not an unknown error.
3. Each of the six bucket-one paths fails rather than emitting a placeholder when the profile can't be resolved; the notice writes no `notice_sent_at` and no `email_send_log` row on that failure.
4. `send-officer-packet` returns the real driver name and unit for a real operator.
5. A scheduled cron invocation leaves an `eld_cron_runs` row with a readable quiet signature; only then the schedule moves to hourly.
6. `eld_cron_runs` has no INSERT/UPDATE/DELETE policy for any role.
7. `rg` for `profiles` + `.eq('id'` returns zero hits; committed test keeps that shape absent.
8. No `[app-url]` warning in a fresh escalation run.

## Technical notes

- Migrations: `certify_rods_day` placeholder rejection (`ELD07`); `eld_cron_runs` table with grants, RLS, policies.
- Edge functions edited and redeployed: `process-eld-escalations`, `send-eld-malfunction-notice`, `send-officer-packet`, `send-return-receipt-pdf`, `send-lease-termination`, `send-test-email`, `send-equipment-return-instructions`.
- Client: certify modal hard-fail, `REJECTION_SQLSTATES`, `src/lib/eld/offline/buildOfficerPacket.ts` required `driver_name`.
- One `cron.alter_job` via the data tool, gated on item 5.
