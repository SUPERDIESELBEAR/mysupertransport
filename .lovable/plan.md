# Three reachability guards

A sweep runs once. These run every pass. Eleven instances of "correct code nothing calls" were found by accident over six weeks; none by a test. These three guards close the classes that a test can close.

Non-negotiable across all three, per your four conditions:

1. **Every allowlist entry carries a written reason**, in the shape of `KNOWN_ANON_EXECUTABLE_ENTRIES`: an object with `id` and `reason`, not a bare string list. A guard whose allowlist takes bare names is a place to hide things.
2. **Called means called from anywhere** — trigger, RLS policy, column default, view, cron, another function body, an edge function, or `src/`. Each guard reports *how* a thing is called, so a legitimate trigger function is never flagged.
3. **The allowlist is seeded only from LEGITIMATE and AWAITING A MODULE.** Everything the sweep called ORPHANED or UNREACHABLE BUT WANTED stays out and stays failing. These guards are expected to be RED on first run.
4. **Ceiling rule.** Each guard has a `_MAX` that may fall freely and rise only for a new entry carrying its justification, asserted the same way `LEGACY_MAX` is today.
5. **The failure message is the product.** These guards stay red for weeks while the backlog is worked. A message that only says "unreachable" teaches people to skim. Every failure names three things, written for someone who did not build the guard: what was searched, which categories came back empty, and what would make it pass — a caller, a revoke, or an allowlist entry with a reason. Shape:

```text
public.assign_user_role(uuid, app_role) is EXECUTABLE by `authenticated`
but nothing calls it.

Searched and found nothing:
  in-database  triggers (0)  RLS policies (0)  column defaults (0)
               other function bodies (0)  views (0)  cron jobs (0)
  repository   supabase.rpc('assign_user_role') under src/ (0)
               and supabase/functions/ (0)
               [tests and src/integrations/supabase/types.ts do not count]

To make this pass, do ONE of:
  1. Call it. Add the screen or edge function that uses it.
  2. Revoke it. If nothing should call it, REVOKE EXECUTE in a migration —
     an uncalled privileged function is the shape that leaked applicant
     data for four months.
  3. Allowlist it, with a reason. Add to KNOWN_NO_CALLER_ENTRIES in
     src/test/function-reachability.test.ts as
     { id: '...', reason: 'awaiting Module N — <what will call it>' }
     and raise KNOWN_NO_CALLER_MAX by exactly one. A bare name is
     rejected; the reason is what a future reader will need.
```

Guards 2 and 3 use the same three-part shape, naming the portal files and nav arrays searched, and offering render-branch / nav-entry / allowlist as the three exits.

---

## Guard 1 — function reachability (`src/test/function-reachability.test.ts`)

**Asserts:** every non-extension function in `public` that any client role holds EXECUTE on is called from somewhere, or is allowlisted with a reason.

**Counts as called:** a live query resolves in-database callers — `pg_trigger.tgfoid`, `pg_policies` qual/with_check, `pg_attrdef` defaults, other `pg_proc.prosrc` bodies, `pg_views.definition`, `cron.job.command`. A repository scan resolves out-of-database callers — any `supabase.rpc('<name>')` literal under `src/` or `supabase/functions/`, excluding `__tests__`, `src/test/`, `*.test.*` and `src/integrations/supabase/types.ts`. The failure message names which categories were searched and found empty.

**Seeds (LEGITIMATE / AWAITING A MODULE only):** `grant_parity_report` (called by the `grant-parity-live` guard, test infrastructure by design). That is the only entry the sweep's classification permits.

**Expected failures after seeding: 14.** The two with literally no reference (`compliance_status`, `eld_cron_status`), the five accessorial writers, `assign_user_role`, `remove_user_role`, `get_pei_requests_needing_action`, and the four I could not classify (`get_application_pei_summary`, `can_driver_message_staff`, `get_inspection_doc_by_token`, `is_valid_application_draft_token`).

Live-DB dependent, so it uses the same `PGHOST` gate and loud skip banner as `definer-live-catalog`.

### Recorded finding — four functions could not be established as called or uncalled

"I could not tell" is a finding, not a gap in the report. These four stay out of the allowlist and stay failing. They are recorded in `docs/tms-build-status.md` as an open finding in their own right, each with what would settle it:

| Function | Why it could not be settled | What would settle it |
|---|---|---|
| `get_inspection_doc_by_token` | **anon-executable and token-gated.** No `supabase.rpc` literal found, but a token flow may reach it from an emailed link or an edge function by another name. | Read the `/inspect/:token` and `/inspect/all/:token` page code and the inspection-share edge functions end to end. If nothing calls it, this is the exact shape of `get_pei_requests_needing_action` — anon-reachable, unreviewed, no caller — and it should be revoked, not allowlisted. **Highest priority of the four.** |
| `is_valid_application_draft_token` | Appears superseded by `get_application_by_draft_token`, but supersession was inferred from the names, not read. | Read both function bodies and the application-resume flow; confirm which one the resume path actually calls. |
| `can_driver_message_staff` | Plausibly intended as an RLS helper; the policy scan did not find it, but a policy could call it indirectly through another function. | Expand the policy expressions on `messages`, `message_threads` and `thread_participants` and check for an indirect call. |
| `get_application_pei_summary` | No caller found; may belong to the PEI screens that were built around the same time as the leaked function. | Read the PEI request and response screens for an equivalent inline query that replaced it. |

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

## What is out of scope, and why — recorded, not merely omitted

Section 2 (columns nothing writes) and section 4 (table read/write balance) get **no guard**, and the reason is written into `docs/tms-build-status.md` alongside the pass, because a future reader will ask why columns were left out:

> A name match cannot distinguish a read from a write. `rg 'issued_on'` returns the same hit whether the line stores the value or displays it, so a column guard would flag live columns as dead and dead columns as live. A guard that cries wolf gets switched off — the 2026-09-04 census failure. Columns and table read/write balance stay a periodic sweep; the sweep's findings are recorded as debt.

No production code is changed by this pass. The three guards are added to the vitest `include` glob and to the `test:guards` subset (taking it from nine files to twelve — the recorded subset size is updated in `src/test/README.md`), and the pass is recorded in `docs/tms-build-status.md` with the exact seed counts and remaining failure counts.

## Report on completion

Per guard: what it asserts, what it counts as called, how many entries it allowlists, how many real failures remain, one verbatim failure message in full, and the verbatim before/after of the removal-and-restore demonstration. Plus the four-unclassifiable finding as recorded.
