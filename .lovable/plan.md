# Driver Assignment (Pass 2B) — Diagnosis and Fix

## Both bugs have one root cause

`src/lib/loadDetail.ts` (line 166) stores the database call function in a standalone constant:

```ts
const rpc = supabase.rpc as unknown as (fn, args) => Promise<...>;
```

Detaching that method from the client drops its owner object, so inside the library `this` is `undefined` and it crashes on `this.rest` — exactly the reported `can't access property "rest", this is undefined`. Every helper that uses this `rpc` constant is affected:

- `fetchDriverEligibilityBulk` -> throws before reaching the server, so the eligibility query returns nothing and the dialog falls back to `{}`. No driver gets a green/amber/red mark, and the eligibility panel never appears. (Bug 1)
- `assignLoadDriver` -> throws on the same line, producing the error toast. (Bug 2)
- `unassignLoadDriver` -> same latent bug, not yet reported.

`updateLoadStatus` (line 132) calls the method inline in parentheses rather than storing it, which keeps the owner reference intact — that is why Pass 2A status changes still work.

## Return shapes match — no contract mismatch

Verified against the migration:

- `check_driver_eligibility_bulk` returns a JSON object keyed by operator id, each value `{ operator_id, eligible, blocking[], warnings[] }` — exactly what the dialog reads.
- `assign_load_driver` returns `{ success: boolean, auto_advanced: boolean, warnings: [] }` — exactly what `AssignResult` and the toast expect.
- There is no destructuring of the RPC result at fault; `rest` is an internal property of the database client, not of our payload.

## Failure happens before the database call — nothing was written

The crash occurs while building the request, so no SQL ran. Confirmed in the database:

- Load `bac3019c…` (ST-TEST-004, Covered) still has `operator_id = null`, `updated_at` unchanged at 15:15 UTC — hours before the 20:39 failures.
- No `load_status_history` rows exist for that load.
- No `load_driver_assignment_override` audit rows; the only recent audit entry is an unrelated OSAS signing.

Nothing to clean up.

## Fix

In `src/lib/loadDetail.ts`, stop detaching the client method: define the `rpc` helper as a function that calls `supabase.rpc(...)` directly (owner preserved), keeping the same typed signature so `fetchDriverEligibilityBulk`, `assignLoadDriver`, and `unassignLoadDriver` are unchanged at their call sites. Also make `updateLoadStatus` use the same helper for consistency.

Add a short comment above the helper explaining that the client method must never be detached into a bare constant, so the pattern is not reintroduced by a later refactor.

Then verify:
- Eligibility marks render per driver in the dialog.
- An assignment succeeds with the correct toast and the load advances to Covered where applicable.
- Unassign works end to end, since it shares the same defect and has not been exercised yet: a Covered load reverts to Available, and a load already past Covered keeps its status and returns the warning instead.
