# Three separate items: two real defects, one harness gap

Decisions recorded: Item 1 fix as proposed including surfacing the swallowed error, plus an audit of nearby queries that discard errors the same way. Item 2 fix as proposed, plus a check for any other storage-path columns added since the guard last passed, plus a decision on the one already-orphaned BOL photo. Item 3 skip loudly, and re-point `resolve_share_token` at the REST RPC endpoint.

## Item 1 — postgrestEmbeds / InspectionComplianceSummary: REAL LIVE BUG

The guard is not stale. Verified against the live database and the live REST API.

- `operators` has no `first_name` / `last_name` columns (names live on `applications`, reached via `operators.application_id`).
- `InspectionComplianceSummary.tsx` line 158 asks for `truck_dot_inspections -> operators(id, application_id, first_name, last_name)`.
- A real request to that URL returns HTTP 400, `42703: column operators_1.first_name does not exist`.

What the page does: it is the Fleet Compliance summary in the management portal. It reads `v_compliance_items` for fleet and driver certificates, then makes a second, separate query for DOT inspections from `truck_dot_inspections` and merges them into the same list.

Consequence for users today: the page does not throw. The result is destructured as `const { data: dotRows }`, the error is discarded, and the merge runs `(dotRows ?? []).forEach(...)`. So the page renders normally with fleet and driver certs — and every DOT Inspection row is silently missing from the compliance summary, always, for everyone. Expiring or overdue DOT inspections never appear there. That is a live compliance-visibility bug, not a test artifact.

Fix (after your go-ahead): change the embed to `operators(id, application_id, applications(first_name, last_name))` and read the name from the nested application, matching how the rest of the app resolves driver names. Also stop discarding the error on that query so future schema drift surfaces instead of silently emptying the section.

## Item 2 — purge-path-coverage / bol_photo_path: REAL RETENTION GAP

`bol_photo_path` is a column on `rods_days`, added 2026-08-18 for the ELD tap-log work. It holds the storage path of the photo a driver takes of the bill of lading / shipping document for that log day. The object lives in the RODS storage bucket, same bucket as the other log-day objects.

How purge works: `purge_rods_day` collects the day's storage paths into an array and returns them; the `purge-rods-day` edge function performs the actual Storage deletes from that returned list. Read of the live function body: it collects `pdf_path`, `certification_signature_path`, `source_document_path`, and `display_document_path`. It does not collect `bol_photo_path`.

Retention implication, stated plainly: yes, BOL photos currently survive a purge they should not survive. The `rods_days` row is deleted, the audit entry records the purge as complete, and the photo object stays in the bucket with no record pointing at it — an orphaned image of a shipping document, outliving the federal record it belonged to. It is exactly the `display_document_path` failure the guard was written for, repeating on the next column. Live count today: 2 `rods_days` rows, 1 with a non-null `bol_photo_path`.

Fix (after your go-ahead): add `bol_photo_path` to the collection block in the four-argument `purge_rods_day`, following the existing `IF coalesce(btrim(...), '') <> ''` pattern, and add it to the expected column list in the test. `NOT_STORAGE_OBJECTS` stays empty — this column does name a Storage object.

## Item 3 — sandbox role mismatch: ENVIRONMENTAL, but not fixable by configuration

Confirmed environmental, not an application defect. `psql` in this sandbox connects as `sandbox_exec`, which is a member of no roles. The grants on the functions are to `postgres`, `anon`, `authenticated`, `service_role`, and `sandbox_exec_<project-ref>`. So any `SELECT some_function(...)` from `psql` returns `permission denied for function ...`.

Important constraint: the sandbox `psql` role is intentionally barred from executing database functions, and granting EXECUTE to it via a migration is explicitly forbidden. The configuration cannot be changed to make these calls work — the two suites cannot execute functions from this harness, by design.

Scope is narrower than it looked. Both suites are mostly catalog reads, which do work:

- `share-token-throttle`: 6 of 7 pass. Only the test that calls `resolve_share_token(...)` fails.
- `rods-live-certification`: 1 of 2 passes. Only the arm that calls `certify_rods_day(...)` inside a rolled-back transaction fails.

Proposed handling, which I want your call on before doing it:

- `resolve_share_token` is granted to `anon`, so its test can be re-pointed at the REST RPC endpoint with the publishable key — a real execution, no grants changed, no rows written (it is the read path).
- `certify_rods_day` requires an authenticated JWT for a specific driver. There is no way to mint one here (the service role key is not available on Lovable Cloud). That arm genuinely cannot run in this harness. Rather than leave it red or quietly delete it, gate it behind an explicit capability check that skips loudly with the same banner style the file already uses for a missing `PGHOST` — so it reads as "did not run, here is why", never as coverage. The static assertions in the file continue to run.

Decision: skip loudly, do not leave it red.

## Follow-ups requested with the approval

- Item 1: after the fix, report whether any other query in `InspectionComplianceSummary.tsx` or the neighbouring inspection components discards its error the same way. A first scan shows roughly 35 `const { data: ... } = await supabase...` sites across that folder with no `error` destructured, so the pattern does repeat; the report will separate the ones that can silently empty a view from the harmless ones.
- Item 2: report whether any other `_path`-style storage columns were added anywhere since this guard last passed, so a third gap is not left behind. Also state explicitly whether the fix cleans up the one already-orphaned BOL photo or whether that object needs a separate one-time removal — the fix changes future purges only, so an existing orphan would need its own cleanup.

## Technical notes

- Files touched: `src/components/inspection/InspectionComplianceSummary.tsx`, `src/test/purge-path-coverage.test.ts`, `src/test/share-token-throttle.test.ts`, `src/test/rods-live-certification.test.ts`, plus one migration re-authoring `purge_rods_day` (four-argument overload only, body otherwise byte-identical).
- No guard assertion is loosened and no EXECUTE grant is added anywhere.
- Final step: full `vitest run`, then report green status and the exact total test-file and test counts as the baseline.