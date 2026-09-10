# Three reachability guards

A sweep runs once. These run every pass. Eleven instances of "correct code nothing calls" were found by accident over six weeks; none by a test. These three guards close the classes that a test can close.

Non-negotiable across all three, per your four conditions:

1. **Every allowlist entry carries a written reason**, in the shape of `KNOWN_ANON_EXECUTABLE_ENTRIES`: an object with `id` and `reason`, not a bare string list. A guard whose allowlist takes bare names is a place to hide things.
2. **Called means called from anywhere** — trigger, RLS policy, column default, view, cron, another function body, an edge function, or `src/`. Each guard reports *how* a thing is called, so a legitimate trigger function is never flagged.
3. **The allowlist is seeded only from LEGITIMATE and AWAITING A MODULE.** Everything the sweep called ORPHANED or UNREACHABLE BUT WANTED stays out and stays failing. These guards are expected to be RED on first run.
4. **Ceiling rule.** Each guard has a `_MAX` that may fall freely and rise only for a new entry carrying its justification, asserted the same way `LEGACY_MAX` is today.

---

## Guard 1 — function reachability (`src/test/function-reachability.test.ts`)

**Asserts:** every non-extension function in `public` that any client role holds EXECUTE on is called from somewhere, or is allowlisted with a reason.

**Counts as called:** a live query resolves in-database callers — `pg_trigger.tgfoid`, `pg_policies` qual/with_check, `pg_attrdef` defaults, other `pg_proc.prosrc` bodies, `pg_views.definition`, `cron.job.command`. A repository scan resolves out-of-database callers — any `supabase.rpc('<name>')` literal under `src/` or `supabase/functions/`, excluding `__tests__`, `src/test/`, `*.test.*` and `src/integrations/supabase/types.ts`. The failure message names which categories were searched and found empty.

**Seeds (LEGITIMATE / AWAITING A MODULE only):** `grant_parity_report` (called by the `grant-parity-live` guard, test infrastructure by design). That is the only entry the sweep's classification permits.

**Expected failures after seeding: 14.** The two with literally no reference (`compliance_status`, `eld_cron_status`), the five accessorial writers, `assign_user_role`, `remove_user_role`, `get_pei_requests_needing_action`, and the four I could not classify (`get_application_pei_summary`, `can_driver_message_staff`, `get_inspection_doc_by_token`, `is_valid_application_draft_token`).

Live-DB dependent, so it uses the same `PGHOST` gate and loud skip banner as `definer-live-catalog`.

## Guard 2 — portal view reachability (`src/test/view-reachability.test.ts`)

**Asserts:** for each portal, every value of its view union has *both* a render branch and a way in — a nav-array entry, a `setView(...)`/`navigateToView(...)`/`setCurrentView(...)` call, or an allowlist entry saying it is deep-link-only.

**Counts as reachable:** source scan of `ManagementPortal.tsx`, `StaffPortal.tsx`, `DispatchPortal.tsx`, `OperatorPortal.tsx` and `src/lib/operatorRoutes.ts`, extracting the union members, the nav arrays, and every programmatic setter call.

**Seeds:** the legitimate drill-downs, each with its reason — Staff `operator-detail`, `vehicle-detail`; Management `operator-detail`, `load-detail`, `load-create`, `load-edit`, `vehicle-detail`, `email-catalog`; Operator `ica-amendment` (inbound link from an ICA amendment notification). **9 entries.**

**Expected failures after seeding: 1** — Management `app-errors`, declared in the type and `ALLOWED_VIEWS` with no render branch and no caller.

Pure file reads, so it runs with no database.

## Guard 3 — nav target validity (`src/test/nav-target.test.ts`)

**Asserts:** every literal path passed to `navigate(...)` or a `<Link to=...>` resolves to something that actually renders that destination — either a real route in `App.tsx`, or, for portal-internal paths, a segment the target portal parses.

**Counts as valid:** routes declared in `App.tsx`; the path segments `DispatchPortal` parses; `VIEW_TO_ROUTE` in `operatorRoutes.ts`; and `?view=` query forms for Management, which parses the query and not the path.

**Seeds:** none expected — no current nav target is knowingly broken-but-acceptable.

**Expected failures after seeding: 1** — `FleetRoster.tsx:617` navigating to `/management/drivers`, a path Management never parses.

---

## Demonstrating each guard fails

Assertion is not evidence. For each guard, in order: run it and capture the verbatim red output with its real findings; then prove it detects a *regression* rather than only a backlog, by removing a known-good caller, re-running, confirming the newly flagged item, and restoring the caller byte-identically before moving on.

- Guard 1: temporarily remove the `supabase.rpc('preview_fuel_import')` call site, confirm `preview_fuel_import` joins the offender list, restore.
- Guard 2: temporarily delete the Staff `Driver App Preview` nav entry, confirm `operator-preview` is flagged, restore. This is the exact defect that shipped three times.
- Guard 3: temporarily change a working `navigate('/dispatch/loads')` to `/dispatch/load`, confirm it is flagged, restore.

`git diff` is shown clean after each restore.

## What is out of scope

Section 2 (columns nothing writes) and section 4 (table read/write balance) get no guard. A name match cannot tell a read from a write, so a guard there would cry wolf, which is the 2026-09-04 failure mode. Those stay a periodic sweep, and the sweep's findings are recorded as debt rather than automated.

No production code is changed by this pass. The three guards are added to the vitest `include` glob and to the `test:guards` subset, and the pass is recorded in `docs/tms-build-status.md` with the exact seed counts and remaining failure counts.

## Report on completion

Per guard: what it asserts, what it counts as called, how many entries it allowlists, how many real failures remain, and the verbatim before/after of the removal-and-restore demonstration.
