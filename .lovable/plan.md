# Investigation: "operators_1.first_name does not exist" in the compliance summary

Conclusion up front: **stale.** The current file does not embed name columns from
`operators`. It goes through `applications`, which is the correct path, and the
project's embed guard is green over that select.

## 1. Is it still live?

No. `src/components/inspection/InspectionComplianceSummary.tsx` line 164, verbatim:

```ts
.from('truck_dot_inspections')
.select('id, operator_id, next_due_date, inspection_date, operators(id, application_id, applications(first_name, last_name))')
.order('next_due_date', { ascending: true });
```

The comment directly above it already records the exact lesson the finding restates
("Driver names are NOT columns on `operators` — they live on `applications`, reached
through `operators.application_id`"), and the call now surfaces `dotError` via
`console.error` plus a destructive toast instead of swallowing it. The finding
describes a version that predates the current file. This is the sixth stale finding
in that batch of nine.

## 2. The shape of `operators`

Live catalog. `public.operators` has 41 columns; `first_name` and `last_name` are
**not** among them. Its foreign keys:

```text
operators_application_id_fkey            -> applications(id)
operators_assigned_onboarding_staff_fkey -> auth.users(id)
operators_deactivated_by_fkey            -> auth.users(id)
operators_user_id_fkey                   -> auth.users(id)
```

No FK to `public.profiles` — `user_id` points at `auth.users`, which PostgREST cannot
traverse into `profiles`. Names live on `applications.first_name` / `last_name`,
reached via `application_id`.

Working screens using that path: `src/pages/staff/StaffPortal.tsx:452` and `:497`,
`src/lib/loadDetail.ts:317`, `src/lib/settlementRun.ts:205`,
`src/pages/management/TerminationsView.tsx:59`,
`src/components/management/OperatorBroadcast.tsx:156`. StaffPortal is the clearest
reference screen.

## 3. What the embed guard asserts

The file is `src/lib/__tests__/postgrestEmbeds.test.ts` (not `src/test/`, as the
finding implies). It parses every `.select()` in `src/` and `supabase/functions/`,
resolves non-literal selects rather than skipping them, and checks three things
against the generated types: that every select was readable, that every column
reference exists on the table it is read from, and that every embed hop crosses a
real FK. Its own header comment names `operators(first_name)` as one of the two
defects that motivated the column check.

Run just now:

```text
[select-scan] 1014 selects found, 1014 read, 0 unreadable
[column-check] 3526 column references verified
[embed-check] 181 embed hops verified
✓ src/lib/__tests__/postgrestEmbeds.test.ts (6 tests) 23ms
```

So the guard does cover this file, and it is green — which is itself evidence the
bad embed is gone. Nothing "should have caught this and did not"; the guard was built
in response to this class of defect and now enforces it.

## 4. Blast radius

Not applicable while the query is correct. For the record, the current failure
behaviour is deliberate and not silent: on `dotError` the component logs and raises a
destructive toast, "DOT inspections could not be loaded — The rest of the compliance
summary is shown, but DOT inspection dates are missing."

The rest of the screen is independent: it reads `v_compliance_items` in a separate
query, and returns early only when `rows` is absent. A DOT failure removes DOT rows
only.

No other embed in `src/` or `supabase/functions/` requests `first_name` from
`operators` — the only other match for that pattern repo-wide is the comment inside
the guard test itself.

How long it was failing: not establishable from here. The record already carries an
entry — "InspectionComplianceSummary embed broken | 2026-08-20 / closed 2026-08-20 |
Fixed before report" — in the stale-issues table, so this same finding has now been
reported and closed twice.

## 5. The correct fix

None needed. The pattern the code already follows is the correct one:
`operators(id, application_id, applications(first_name, last_name))`, matching
StaffPortal and the other screens named above. Nothing to implement.

## Contradictions with the record

None found. The record's stale-issues table already lists this exact finding as
closed on 2026-08-20; the current file, the live catalog and the green embed guard all
agree with it. Worth adding a second occurrence date to that row so a third report is
triaged rather than re-investigated.
