## Correction 1: there is no `useApplications`, and no `applications → profiles` embed

I checked before planning around it, and the premise doesn't hold in this codebase:

- No file named `useApplications*` exists anywhere under `src` (`rg --files -g '*useApplications*'` → nothing), and no file references that symbol.
- No `applications → profiles` embed exists. Every `.from('applications')` read is `select('*')` or a narrow column list (`ManagementPortal.tsx:232/628/647/1875/2013/2182`, `StaffPortal.tsx:823/842`, `PipelineDashboard.tsx:1755/1830`, `ApplicationStatus.tsx:39`, `SubmitSSN.tsx:30`). None embeds `profiles`.
- The `.lovable/plan.md` file contains no mention of either.

So there is no fifth instance and nothing to verify on the hiring pipeline — the applications list has no broken embed to render nothing from. The count is **four**: `ELDMalfunctionsPanel` (fixed last turn), `ELDDeviceDataQuality:38`, `ComplianceDashboard:129`, `OperatorReturnReceipts:44`. The first three are `operators → profiles`; the fourth is `equipment_receipts → profiles`, which fails for the same reason (`uploaded_by` points at `auth.users`).

If you were thinking of a specific screen rather than a hook name, tell me which one and I'll drive it as its own verification before touching it. Otherwise I'll load the Applications list as staff once during the post-fix pass purely to confirm it is unaffected, and not carry it as a finding.

## Correction 2: the lint rule enumerates every embed and checks each against real FKs

Agreed on the general shape. The count you asked for: **103 embed occurrences across 30 distinct table pairs in 44 files.** That is small enough to check exhaustively, so no scope reduction is needed.

Source of truth for the FK map: `src/integrations/supabase/types.ts`, which is generated from the database and carries a `Relationships` array per table with `referencedRelation` for every real FK. That gives the same answer as `information_schema.table_constraints` without a live query in the test, and it regenerates whenever the schema changes — so a newly added FK immediately makes a previously-flagged embed legal.

Two things a naive grep gets wrong that the rule must handle, both visible in the enumeration I ran:

- **Nesting.** A flat scan reports `eld_devices → profiles` for `ELDDeviceDataQuality`, when the embed is actually `eld_devices → operators → profiles`. Each hop must be checked against its own parent, so the parser walks the select string's paren tree rather than matching table names anywhere in it.
- **Column false positives.** A flat scan produced pairs like `operators → application_id` and `truck_owners → operator_id`. The rule only treats a token as an embed when it opens a nested field list *and* names a known table in the generated types.

Reverse embeds (child table listing its parent, e.g. the 19 `operators → onboarding_status` and 36 `operators → applications` uses) resolve on the child's FK and are legal in both directions; the check accepts an FK found in either direction between the pair.

Expected result on today's code: 4 failures, matching the four instances above, and `eld_malfunction_events → profiles` passing (that table has three genuine FKs into `profiles`).

## Plan

**A. Fix the four embeds**
Replace each with a second read keyed on the id that exists, matching the pattern the edge functions already use:
- `ELDDeviceDataQuality.tsx`, `ComplianceDashboard.tsx` — select `user_id` off `operators`, then one `profiles.select('user_id, first_name, last_name').in('user_id', ids)`, mapped in memory.
- `OperatorReturnReceipts.tsx` — same shape keyed on `uploaded_by`.
- (`ELDMalfunctionsPanel` already converted.)

**B. Lint rule as a vitest test** — `src/lib/__tests__/postgrestEmbeds.test.ts`
Walk `src/**/*.{ts,tsx}`, extract `.from('x')…​.select('…')` literals, parse the select into a hop tree, and for each parent→child hop assert an FK exists in either direction per the generated `Relationships`. Failure message names file, line, the pair, and prescribes the second-read fix. Skip aggregates and dynamic (non-literal) selects, and report the count of selects skipped so silent coverage loss is visible.

**C. `?tab=` cleanup, with the two-parameter distinction verified rather than assumed**
Dead `/management` links found (portal reads only `view`, `op`, `app`, `status`, `section`, `event`):
- `/management?tab=driver&operator=…` — migration `…20260801001200…`
- `/management?operator=…` — migration `…20260422192300…` (×2), `notify-pay-setup-submitted/index.ts:139`
- `/management?application=…` — migrations `…20260519161607…`, `…20260515183610…` (×2)
- `/management?view=n` — `send-release-note/index.ts:77`, should be `whats-new`

`?tab=` on `/operator`, `/dashboard` and `/dispatch` is legitimate — each of those portals reads and normalizes it — so the cleanup stays scoped to `/management`.

Fixes: accept `operator`/`application` as aliases for `op`/`app` in the portal (already-sent notification links live in the DB and can't be rewritten), a migration correcting the link-writing DB functions, and the two edge-function edits. Each repaired link then gets driven in the browser — including with `sessionStorage.mgmt_last_view` pre-seeded to a different section, to prove the URL wins.

**Also in C:** `ManagementPortal.tsx:122-131` honors a URL `view` immediately only when `op` or `app` is present, otherwise `sessionStorage.mgmt_last_view` wins. Escalation links carry `view` + `event` and neither `op` nor `app`, so for a returning user they land on the last-viewed section. Last turn's verification passed only because the session was fresh. `event` joins the deep-link marker set.

**D. Read the ELD panel end to end after the fix** — device-quality card against a deliberately incomplete device (it currently can never report a gap), malfunction list, clocks, pause and delivery-error states, then clean up any scratch rows.

## Technical notes
- No `operators → profiles` FK is proposed. `operators.user_id` references `auth.users`, and PostgREST will not traverse from `public` into the `auth` schema; the second-read pattern stays the standard and the rule encodes it.
- Management stays read-only on `rods_days` / `rods_events`.
