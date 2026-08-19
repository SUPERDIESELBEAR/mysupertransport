# Lock operator-facing Load Detail behavior into tests

Add an automated test file that pins the four operator-facing guarantees just verified manually, so a future change to Load Detail cannot silently expose staff-only data to drivers.

## What gets tested

1. Hold banner is hidden for an operator viewing their own load that carries an active hold flag — and still shown for staff on the same load.
2. Internal Notes block does not render for an operator; driver-facing notes and special instructions still do. Staff see all three.
3. The claim flags read is never issued for an operator session — asserted by counting calls to the `claim_flags` table on the mocked client (must be 0 for operator, 1 for staff), not by checking that a rejected request happened.
4. A load the operator cannot access resolves to null and the page renders the "This load could not be found." state with a Return to Loads action, not load data.

## Technical approach

- New file `src/pages/dispatch/__tests__/loadDetailOperatorAccess.test.tsx`, modeled on the existing `loadsRouting.test.tsx` (same Vitest + Testing Library + MemoryRouter + QueryClientProvider setup, same `useAuth` role-switching mock).
- Mock `@/integrations/supabase/client` with a PostgREST-shaped stub that records each `from(table)` call in a spy array. `loads` returns a fixture load with internal/driver-facing/special notes; `claim_flags` returns one active `hold` row; `operators`/`profiles` return the driver name rows. A second fixture id simulates the inaccessible load by returning `null` from `maybeSingle`, matching what RLS produces.
- Render `LoadDetailPage` with `loadId` passed directly so no route parsing is needed, and flip `authState.roles` between `['operator']` and `['dispatcher']` per case.
- No production code changes — all four checks currently pass, so the tests are pure regression guards. If any assertion fails on first run, report it rather than loosening the assertion.
