# Load Management — Test Data Seed

Data insert only. No table, policy, trigger, or code changes.

## Current state (verified)

- `brokers` is empty (0 rows) and `loads` is empty (0 rows), so nothing collides.
- Active non-demo operator records exist, so test loads can reference a real operator.

## What gets inserted

**brokers (2)** — "Test Broker Alpha" (MC TEST-100001, factoring approved, Net 30) and "Test Broker Beta" (MC TEST-100002, not approved with the given reason, Net 45). Guarded with a `WHERE NOT EXISTS` on `company_name`, so re-running adds nothing.

**loads (5)** — ST-TEST-001 through ST-TEST-005 exactly as specified: dry van in transit, reefer dispatched with the full temperature block, hopper-bottom per-ton delivered, loadout drop-and-hook covered, and flatbed ready-to-invoice. `dispatcher_id` null on all five. Loads that need a driver point at one existing active non-demo operator.

**load_stops (10)** — one pickup and one delivery per load, sequences 1 and 2, with facility, address, and appointment windows computed relative to today in US Central and stored as timestamptz.

**claim_flags (1)** — a hold on ST-TEST-005: damaged_goods, the given description, $1,200 estimated, active.

## Notes

- Every row is identifiable by the `ST-TEST-` load numbers, `Test Broker` names, and `TEST` text, so a later cleanup is a simple delete by those patterns (stops and the claim flag cascade from the loads).
- The existing status-history trigger on `loads` fires on updates only, so inserting loads with a final status writes no history rows.
- The claim-flag resolution and history triggers will run normally on the single claim row; that is expected trigger behavior, not a change.
- I'll report the inserted row count per table when done.
