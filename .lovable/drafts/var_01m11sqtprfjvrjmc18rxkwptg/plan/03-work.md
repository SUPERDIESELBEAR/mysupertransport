## Triage of the non-literal selects, measured before any change

26 sites total: 23 in `src/`, 3 in `supabase/functions/`.

| Shape | Count | Resolution |
| --- | --- | --- |
| Concatenated string literals (`'a, b, ' + 'c'`) | 8 | Fold at parse time; no code change |
| Module-level `const` identifier | 12 | Resolve the identifier, following imports (`MESSAGE_SELECT` from `messaging/types.ts`, `EXTENSION_REQUEST_SELECT` from `lib/eld/extensionRequest.ts`, `DEVICE_MODEL_SELECT` from `lib/eld/revokedList.ts`) |
| Template interpolating a module-level `const` | 2 | Substitute (`OS_FIELDS`, `POLICY_COLUMNS`) |
| `.select(col)` where `col` is a two-branch literal ternary | 4 | Evaluate both branches, check each |

**Zero need a named allow-entry, and no hoisting is required** — every site is statically resolvable once the resolver understands these four shapes. The allowlist ships empty, with a comment saying each entry is a hole and it must not be allowed to grow.

## Errors discarded in edge functions

**247 queries across 78 files in `supabase/functions/` destructure only `data`** and drop `error` — the same `const { data: opRow }` shape that let a nonexistent column run unnoticed for months, and the same shape `InspectionComplianceSummary` was hardened against. Only the one site in `send-notification` is fixed in this pass; the count is recorded in the docs as a known standing exposure.

## The work

### 1. Widen the scan to edge functions

`postgrestEmbeds.test.ts` currently roots at `src/`. Add `supabase/functions/` as a second root, same walker exclusions, accepting `.ts`. Schema parsing, hop resolution, and the per-table column check are reused unchanged.

### 2. Resolve non-literal selects instead of skipping them

Replace the `skipped++` path with a resolver covering the four shapes above. Every `.select(` occurrence must end in one of two states:

- **Read** — argument resolved to one or more concrete strings, each checked for column existence and FK-backed hops.
- **Unreadable** — the test FAILS, naming file, line, and the raw argument text, and saying it must be made resolvable or the resolver extended.

The root table is found by walking back to the nearest `.from('table')` with no intervening `.select(`, so long `.insert().select()` chains resolve rather than falling off a fixed character window. A select whose root cannot be determined counts as unreadable and fails too.

### 3. Fix the embed the widened scan finds

`supabase/functions/send-notification/index.ts:406` — `operators.email` does not exist. Read the driver email from `applications` via `operators.application_id`, matching every other caller, and stop discarding the error on that one query. Without this the widened guard is red on arrival. **`send-notification` needs an explicit deploy; it does not auto-deploy.**

### 4. Record issue 1 as closed

In `docs/tms-build-status.md`: the `InspectionComplianceSummary` embed was fixed Aug 20, 2026 in commit `006a397d`; the reported `operators_1.first_name does not exist` error predates that fix; no live source exists in application code, views, functions, or logs. Closed as stale so it is not re-investigated. Alongside it: the guard now covers edge functions and fails on unreadable selects, this widening found and fixed `operators.email` in `send-notification`, and 247 edge-function queries still discard their error.

## Technical notes

- Files touched: `src/lib/__tests__/postgrestEmbeds.test.ts`, `supabase/functions/send-notification/index.ts`, `docs/tms-build-status.md`, `src/test/README.md`, and the three test baseline files if counts move.
- No schema change, no migration, no RLS change, no application behaviour change beyond the one corrected query.
- Final step: full `vitest run` in both shapes, reporting the summary lines verbatim, plus confirmation of the `send-notification` deploy.
