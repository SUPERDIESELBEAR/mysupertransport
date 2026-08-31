# Parked-state verification screenshots + rollover deploy check

## Deployment status (already checked)

`rollover-dispatch-status` is live: a POST to it returns `403 {"error":"Forbidden"}`, which is the auth guard inside our own function code, so a deployed build exists. What that probe cannot prove is that the *current* build includes the parked-skip logic (`operators.is_parked` filter). So the plan explicitly redeploys it and then re-checks, rather than assuming.

## Why this needs approval

Four of the five screenshots require writing real data in the live preview:

- Parking a driver (writes `operators.is_parked` + an `operator_parking_events` row).
- Opening the termination confirmation and the active-and-dispatched warning (safe — read-only if not submitted).

I will use an existing driver, park them, take the shots, then unpark them so the board is left exactly as found. No `lease_terminations` row will be created — shot 5 uses one of the nine existing rows already in the table.

## What I will capture

1. **Park control being set** — `ParkDriverControl` dialog on the operator detail panel with a reason selected and an expected return date filled in.
2. **Parked driver on the dispatch board** — the driver still listed and active, carrying the `ParkedBadge`.
3. **Termination confirmation dialog** — `TerminationConsequenceDialog` showing consequence text and the typed-name field.
4. **Active-and-dispatched warning** — the same dialog's warning branch for a driver who is active and on the board, including the "park instead" link.
5. **Existing termination indicator** — a driver who already has a `lease_terminations` row, showing `TerminationBadge`.

## Technical steps

1. Redeploy `rollover-dispatch-status` and confirm the deployed source contains the `is_parked` skip; report the deploy result explicitly.
2. Playwright script under `/tmp/browser/parked-verify/`, viewport 1280x1800, session restored from the injected preview auth env vars.
3. Pick a non-demo active driver on the dispatch board; park via the UI (not SQL) so the RPC path is exercised.
4. Capture shots 1-2, then open the termination dialog for shots 3-4 and **cancel** both times.
5. Find an existing terminated driver for shot 5.
6. Unpark the test driver through the UI and verify `is_parked` is back to false.
7. Report each screenshot with the driver used and the final data state.

## Left unchanged

No migrations, no component edits, no `lease_terminations` writes, no changes to the nine historical rows.
