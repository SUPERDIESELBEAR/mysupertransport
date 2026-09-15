# Truck-owner tenancy decisions

Documentation-only pass. 2026-09-15 19:00 UTC. Immutable: append only.

No code, no migrations. Only `docs/tms-build-status.md` and
`docs/tms-wish-list.md` were edited. This is the decision record the tenancy
pass will build from.

## 1. The problem, as found

The B6 Group 2 pass (`docs/passes/2026-09-15-1845-b6-group-2-documents.md`)
held back `operator_documents` (1,184 rows) and `document_acknowledgments`
(365 rows) rather than break them. A user whose only role is `truck_owner`
(`24ee1b9e-2391-4cf4-873d-e9db3b14b7d0`) holds neither a `company_members` row
nor an `operators` row, so `current_company_id()` returns NULL for him — and a
NOT NULL `company_id` under Shape 1 would have made his next write raise 42501.

Four rows on `document_acknowledgments` belong to such a user today, and he
reaches both tables through `OperatorPortal` (`viewerRole = 'truck_owner'`, plus
a deliberate truck-owner INSERT policy on `operator_documents`). The path is
real, not theoretical.

CAUGHT BEFORE IT FIRED. Unlike the invite defect of 2026-09-15 — found after the
code had broken, with invitation emails already sent — this break was found by
reading policies and code, before any write failed. The held-back tables are
guarded: a guard fails if either gains the column before the resolver learns the
third source.

## 2. What a truck owner is — established by the owner

- may own several trucks leased to the carrier;
- may drive one himself, in which case he is ALSO an operator;
- may employ his own drivers for his other trucks, and pays them himself;
- the settlement goes to the TRUCK OWNER regardless of who drives;
- FOR THIS APP, a truck owner leases to ONE carrier only. Recorded as a
  SIMPLIFYING ASSUMPTION the schema depends on, so anyone later asked to support
  multi-carrier owners knows it was a choice;
- a hired driver is an ORDINARY OPERATOR: his own login, documents,
  inspections, dispatch and loads;
- a truck owner may briefly have NO drivers — between hires, or a truck idle.
  Rare, but real;
- a hired driver ALWAYS KNOWS he drives for a truck owner. No disclosure work is
  needed. Recorded so a future reader does not treat the visibility as hidden.

## 3. The tenancy decision

`truck_owners` gets its own `company_id`, NOT NULL. The resolver does NOT derive
the company from the operators he owns.

Reasoning: a truck owner belongs to the carrier BECAUSE HE LEASED IT A TRUCK,
not because of who happens to be driving this week. Deriving through drivers
would leave him resolving to nothing during the no-driver gap in section 2 — a
truck owner logging in and unable to see his own truck. Same reasoning as
`operators` carrying its own column rather than resolving through something else.

`current_company_id()` gains a THIRD source, in order:

1. `company_members` (staff membership),
2. his own `operators` row (driver),
3. his `truck_owners` row (truck owner).

Fail closed if none resolve, as today.

This unblocks `operator_documents` and `document_acknowledgments`. The B6 guard
against those two gaining the column MUST BE UPDATED IN THE SAME PASS THAT ADDS
IT, or it will fail — the guard is doing its job, and removing the block without
retiring the guard is a contradiction, not a fix.

## 4. The fleet view — wish list, not now

Recorded in `docs/tms-wish-list.md` as "Truck-owner fleet view — switcher first,
summary later". The shape, decided 2026-09-15:

- A TRUCK SWITCHER FIRST: it reuses the existing per-driver screens by changing
  whose data fills them — cheap, because those screens already exist.
- A combined DETAIL view is a redesign of each screen, since every row would
  need to say which truck it belongs to.
- A combined MONEY summary is easy — settlements, fuel spend and loads
  delivered are sums across his operators.

Order and reason: build the switcher, and let a month of real use decide whether
the summary earns its place.

OPEN QUESTION: whether owners think per-truck or per-fleet. Nobody knows yet.

PREREQUISITE INVESTIGATION: 16 policies already use
`is_truck_owner_for_operator`. Whether they cover fuel and loads — and ALL his
trucks rather than one — has NOT been established. That investigation is its own
pass, before the switcher is built.

## 5. Changes

- `docs/tms-build-status.md` — decision record appended (this report's sections
  1–3, plus the pointer to the wish list).
- `docs/tms-wish-list.md` — new PARKED CAPABILITIES entry with trigger;
  "Last updated" moved to 2026-09-15.

No other file touched. No code, tests, or migrations; per the standing rule the
report is written after the last change, and the last change is documentation.
No suites were run — there is nothing for a suite to measure.
