# Pass report — 2026-09-23 20:13 UTC — demo carrier, stage 4, part 2a

PEI cadence and the inspection programme made per-carrier; SUPERTRANSPORT values removed
from column defaults. Carrier creation is part 2b. Prompt received complete (last line:
"END OF PROMPT…"). No contradictions found with the live system beyond the two the
stopped pass reported (the ones this pass fixes). No second carrier committed.

## Correction to Part 1, Part B row 18

Part 1 listed `pei_cadence_settings` as "SUPERDRIVE default (10/30/on)" per carrier. That
was wrong: the table was a platform singleton (`PRIMARY KEY (id)`, `id boolean DEFAULT true`,
`CHECK (id)`); only one row could ever exist. Found in
`docs/passes/2026-09-23-1949-demo-carrier-stage-4-part-2-stopped.md`, fixed here.

## Migration 0057_per_carrier_pei_cadence_and_inspection_programme.sql

FIX 1 — PEI cadence per carrier
- Dropped `pei_cadence_settings_pkey (id)` and `pei_cadence_settings_id_check`; new
  `PRIMARY KEY (company_id)` (company_id was already NOT NULL; restrictive
  `tenant_isolation` policy already present, unchanged). `id` kept, commented DEPRECATED.
- `set_pei_cadence_settings` now updates `WHERE company_id = current_company_id()`, refuses
  a caller with no carrier (42501) or no row (P0002); carrier recorded in the audit metadata.
- `pei-auto-cadence` reads every carrier's row, and handles only requests of carriers
  whose follow-ups are on, each with that carrier's own interval / GFE day. No row → skipped.
- `ApplicationPEITab`, `PEICadenceSettingsCard`: unchanged code — their read is scoped by the
  restrictive tenant policy, which now returns exactly the caller's own carrier's row
  (proven: Mae sees 1 row with a scratch carrier present).

FIX 2 — the inspection programme can be off
- `inspection_program_settings.programme_enabled boolean NOT NULL DEFAULT true`;
  unique index `inspection_program_settings_company_uniq (company_id)`; `submission_email`
  default `'inspections@mysupertransport.com'` dropped (stored value unchanged).
- `request_inspection_grace`, `grant_inspection_grace`: read the caller's own carrier's row
  (they previously took `ORDER BY created_at LIMIT 1` — any carrier) and refuse 42501 when
  there is no row or the programme is off.
- New trigger `ab_enforce_inspection_programme_enabled` on `inspection_program_payments`
  (BEFORE INSERT, after the stamp): no reimbursement or bonus row for a carrier whose
  programme is off. Function EXECUTE revoked from PUBLIC/anon/authenticated.
- `cron-inspection-reminders`: per-carrier settings; a driver whose carrier has no row or
  the programme off gets no reminder (`programme_off` count in the response).
- Screens: `InspectionProgramPanel` shows "The inspection programme is off for this
  carrier…"; `QuarterlyInspectionPanel` and `InspectionGraceRequestCard` replace their
  content with a plain "programme is off" card (no extension button).

**Defect found and fixed:** both grace functions wrote `audit_log(..., details)` — there is
no `details` column (it is `metadata`). Every grace request and every staff grant has been
failing at its last statement and rolling back. Fixed to `metadata`. This changes
SUPERTRANSPORT behaviour in one way: grace requests and grants now succeed. Owner should know.

FIX 3 — no SUPERTRANSPORT values in column defaults
Search of every `public` column default (SUPERTRANSPORT, 2309365, 788425,
mysupertransport.com, `'ST'`, Pleasant Hill; also checked 'MO', America/Chicago, Marc):
| Column | Default | Action |
|---|---|---|
| `invoice_number_config.prefix` | `'ST'` | dropped |
| `load_number_config.prefix` | `'ST'` | dropped |
| `inspection_program_settings.submission_email` | `'inspections@mysupertransport.com'` | dropped |
| `carrier_profile.fmcsa_division_state` | `'MO'` (SUPERTRANSPORT's state) | dropped — required input at creation |
| `fleet_settings` | — | unique index `fleet_settings_company_uniq (company_id)` added |
None left. America/Chicago appears in no column default.

Consequence handled: `allocate_invoice_number` self-created a new year's row relying on the
`'ST'` default — on 2027-01-01 SUPERTRANSPORT invoicing would have failed NOT NULL. It now
carries the carrier's own prefix/separator/padding forward from its latest year, and refuses
(P0002) a carrier with no numbering row at all. (Load-number D1 remains part 2b.)

Not changed, recorded: `cron-inspection-reminders` email body still says "SUPERTRANSPORT
covers the inspection fee" — carrier identity in emails is owner decision (7)/(9) territory.

## Proofs (raising transactions, scratch carrier `…c0b2`, never committed)

```text
cadence rows=2
eval SCRATCH CARRIER B (3/20): candidates=1 gfe_due=0 followups_due=1
eval SUPERTRANSPORT, LLC (10/30): candidates=19 gfe_due=19 followups_due=0
scratch day-7 request, own 3/20 -> follow-ups due 2; under ST 10/30 it would be 0
Mae sees cadence rows=1
Mae sees programme rows=1 enabled=true
after Mae setter: B=3/20/true ST=10/30/true
scratch grace refused 42501: The inspection programme is off for this carrier, so no extension can be requested or granted.
scratch payment refused 42501: The inspection programme is off for this carrier; no reimbursement or bonus can be recorded.
ST payment (programme on): accepted
reminder-eligible carriers: SUPERTRANSPORT, LLC
```
Second transaction (scratch driver, isolating the gate):
```text
operator company=…c0b2   driver resolves to=…c0b2   driver sees programme rows=1
programme ON: grace request accepted (pending)
programme OFF: 42501 The inspection programme is off for this carrier, so no extension can be requested or granted.
```
The evaluation is the pei-auto-cadence rule in SQL (milestones every interval below the
GFE day; GFE at/after it). SUPERTRANSPORT's 19 candidates are evaluated with 10/30 exactly as
the old single-row code did (same row). In the first transaction the scratch driver, who
also had a company_members row, read 0 programme rows; the second (operator row only, the
real driver shape) read 1 — the gate proof is the second one.
Residue: carriers 1; scratch carrier/applicant/operator/membership/cadence rows 0.

Cadence run: no scheduled `pei-auto-cadence` run occurred during the pass (log shows only
the post-deploy shutdown). It was not invoked by hand — a real run sends real emails.

## SUPERTRANSPORT unchanged — before and after (identical, `diff` empty)

```text
pei_cadence|6b54d0e6-…|10|30|t
pei_status pending 13 · sent 1 · follow_up_sent 25 · completed 17 · gfe_documented 91 (147)
pei_cadence_candidates 19
insp cap 150 · bonus 100/50/25 · grace 15 days, 2 per 12 months · inspections@mysupertransport.com  (programme_enabled = true)
payments 0
load_cfg ST next 70 (2026)      inv_cfg ST 2026 next 2
carriers 1
```

## Tests, typecheck, deploy

Full suite `npx vitest run --maxWorkers=2`, verbatim:
```text
 Test Files  2 failed | 219 passed | 2 skipped (223)
      Tests  2 failed | 2220 passed | 16 skipped (2238)
   Start at  20:02:24
   Duration  619.48s (transform 7.41s, setup 49.27s, collect 42.10s, tests 836.23s, environment 204.31s, prepare 31.10s)
```
Both failures the familiar pooler `EAUTHQUERY auth_query secret check timed out`
(grant-parity-live, fuel passthroughDriverList). Re-run with definer-live-catalog and
definer-search-path: `Test Files 4 passed (4)`, `Tests 33 passed (33)`.
New guard `src/test/per-carrier-settings.test.ts`: 4 passed.
Typecheck `npx tsgo --noEmit -p tsconfig.app.json`: exit 0.

Deployed `pei-auto-cadence` and `cron-inspection-reminders` (deploy tool success). Confirmed
live with an OPTIONS request to each (200) — not a real invocation, which would send emails.

## Files authored by this pass

- `drizzle/migrations/0057_per_carrier_pei_cadence_and_inspection_programme.sql` (+ drizzle meta; `src/integrations/supabase/types.ts` regenerated)
- `supabase/functions/pei-auto-cadence/index.ts`
- `supabase/functions/cron-inspection-reminders/index.ts`
- `src/pages/management/InspectionProgramPanel.tsx`
- `src/components/fleet/QuarterlyInspectionPanel.tsx`
- `src/components/operator/InspectionGraceRequestCard.tsx`
- `src/test/per-carrier-settings.test.ts`
- `docs/tms-build-status.md`
- `docs/tms-wish-list.md`
- `docs/passes/2026-09-23-2013-demo-carrier-stage-4-part-2a.md`
