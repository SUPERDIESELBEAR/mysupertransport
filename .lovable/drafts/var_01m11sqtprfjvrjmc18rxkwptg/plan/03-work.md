## The work

### 1. Widen the scan to edge functions

`postgrestEmbeds.test.ts` currently roots at `src/`. Add `supabase/functions/` as a second root, keeping the same walker exclusions (`node_modules`, `__tests__`) and accepting `.ts`. Everything else — schema parsing from the generated types, the hop resolver, the per-table column check — is reused unchanged.

### 2. Resolve non-literal selects instead of skipping them

Replace the `skipped++` path with a three-way outcome:

- **Literal** (`'…'`, `"…"`, plain backtick): checked as today.
- **Resolvable**: the select argument is a module-level `const` string, or a template whose `${}` interpolations are all module-level `const` strings. Substitute and check the resulting string. This covers the common shape in this codebase — `POLICY_COLUMNS` in `payTreatment.ts:119`, `OS_FIELDS` in `managementMetrics.ts:109`.
- **Unresolvable**: fail the test, listing file, line, and the raw select text, with a message saying the guard could not read it and it must be made resolvable (hoist the column list to a module-level `const`) or the guard extended.

The failure list is the point: a guard that passes over what it cannot read reports green while covering nothing.

### 3. Expect the 21 + 3 to need triage

The 24 non-literal selects are not all going to resolve on the first pass. Each one gets handled in the same commit, by hoisting its column list to a module-level `const` so the guard can read it — a mechanical change with no behavioural effect. Any that genuinely cannot be made static (a select assembled from runtime data) gets an explicit, named allow-entry carrying a one-line reason, so it reads as a known exception rather than as coverage.

### 4. Fix the embed the widened scan finds

`supabase/functions/send-notification/index.ts:406` — read the driver email from `applications` via `operators.application_id`, matching how every other caller resolves it, and stop discarding the error on that query. Without this the widened guard is red on arrival.

### 5. Record issue 1 as closed

In `docs/tms-build-status.md`: the `InspectionComplianceSummary` embed was fixed Aug 20, 2026 in commit `006a397d`; the reported `operators_1.first_name does not exist` error predates that fix; no live source exists in application code, views, functions, or logs. Closed as stale so it is not re-investigated. Note alongside it that the guard has been widened to edge functions and now fails on unreadable selects, and that this widening found and fixed the `operators.email` read in `send-notification`.

## Technical notes

- Files touched: `src/lib/__tests__/postgrestEmbeds.test.ts`, `supabase/functions/send-notification/index.ts`, whichever of the 24 call sites need their column lists hoisted, `docs/tms-build-status.md`, and the three test baseline files if counts move.
- No schema change, no migration, no RLS change.
- `send-notification` must be redeployed for its fix to take effect.
- Final step: full `vitest run` in both shapes, reporting the summary lines verbatim.
