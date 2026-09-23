# Pass report — 2026-09-23 19:49 UTC — demo carrier, stage 4, part 2 — STOPPED

Prompt received complete (last line: "END OF PROMPT. If this line is not the last thing
you received, STOP and report…"). Read first: stage 4 part 1 report (Parts B, C, D,
finding 1, D1). Stopped under the prompt's own rule — two contradictions with the live
system. **Nothing was built: no migration, no function, no screen, no data, no deploy.**
P44–P47 are NOT yet recorded in docs/tms-build-status.md (Step 1 is part of the build pass).

## Contradiction 1 — PEI cadence is a platform singleton, not a per-carrier row

Step 3 requires a "PEI cadence … default" row for the new carrier. Live:

- `pei_cadence_settings` PRIMARY KEY `(id)`, `id boolean DEFAULT true`, `CHECK (id)`.
  Exactly one row can ever exist (today: SUPERTRANSPORT's). A second carrier's insert
  fails 23505. Part 1's Part B row 18 ("SUPERDRIVE default 10/30/on") was wrong — it did
  not check the key.
- `set_pei_cadence_settings(boolean,integer,integer,text)` updates `WHERE id = true`.
- `pei-auto-cadence` edge function reads it with a bare `.maybeSingle()` (no company) and
  applies one cadence to every carrier's PEI requests.
- `ApplicationPEITab.tsx` and `PEICadenceSettingsCard.tsx` read it with no company filter.

Fix needed first (one migration + two readers + function): per-company key
(unique `company_id`, retire the boolean key), setter scoped to `current_company_id()`,
cron grouping requests by carrier.

## Contradiction 2 — the inspection programme has no "off" (P46)

`inspection_program_settings` has no enabled/on-off column (bonus levels, cap, grace,
groups, reminders, `submission_email DEFAULT 'inspections@mysupertransport.com'`).
"Off" could only be faked (bonuses 0), and grace/reimbursement/reminders
(`cron-inspection-reminders`, `QuarterlyInspectionPanel`, `InspectionGraceRequestCard`,
`InspectionProgramPanel`) would still run. Also: the column default is SUPERTRANSPORT's
address — a new carrier must never inherit it.

Fix needed first: add `programme_enabled boolean NOT NULL DEFAULT true` (SUPERTRANSPORT
unchanged), make the four readers honour it, drop the SUPERTRANSPORT email default.

## Also found (not contradictions, will be handled in the build)

- `invoice_number_config.prefix DEFAULT 'ST'`, `load_number_config.prefix DEFAULT 'ST'` —
  must lose the default (D1 / Step 2).
- `fleet_settings`, `inspection_program_settings` have no per-company unique index.
- `audit_log` has no `company_id`; the carrier is named in metadata.

## Decision owed

Approve both fixes as the first part of the next pass (my recommendation), or say
otherwise. Then Steps 1–6 run as written.

## Tests, typecheck, deploy

Not run — nothing changed.

## Files authored by this pass

- `docs/passes/2026-09-23-1949-demo-carrier-stage-4-part-2-stopped.md`
