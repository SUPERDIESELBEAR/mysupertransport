# Marcus Mueller driver record — why it reads 11% and why HARNESS-1 exists

## What the records actually show

There are two separate driver records carrying your name, tied to two different logins.

**1. Your original test driver record** (created Apr 3, application "Marcus Mueller", marcsmueller@gmail.com, unit 1900)

- Its onboarding row was last written on **Apr 24, 2026** and has not changed since. Every stage flag is at its starting value: MVR `not_started`, criminal history `not_started`, PE screening `not_started`, 2290 / title / photos / inspection `not_started`, ICA `not_issued`, MO docs `not_submitted`, decal `no`, ELD `no`, fuel card `no`, no insurance date, no go-live date, `fully_onboarded = false`. Only a few side fields survived (April request/receipt dates, decal photos, dash cam CAM1234, BestPass BP1234, truck year 2004, stated value 75000).
- That is the whole reason the meter reads ~11%: the progress bar counts stage flags, and nearly all of them are back at their initial values while a couple of leftovers still count.
- The history matches: `onboarding_completed` on **Apr 13**, then `operator_status_updated` + `go_live_updated` on **Apr 24** — after which the row went quiet. The drop happened back in April during testing, not recently. Nothing since then touched onboarding for this record.
- Two more things: the linked application is still `is_draft = true` / `review_status = pending` (never formally approved), and the operator was **deactivated on Jul 31 at 22:59 UTC** with no `deactivated_by` and no audit entry — i.e. by a service-role script, not by a person in the UI. That is 19 seconds after a mobile-preview session was minted against this same driver, and the day before the ELD harness driver was created.

**2. HARNESS-1** (created Aug 1, `is_demo = true`, deactivated Aug 1 21:16)

- A test-harness driver created during the ELD/RODS work, flagged as a demo account. No application attached, no unit data, empty onboarding row.
- It carries your name because it was created under your **second login** (`5cca4f77…`), the one holding owner + management + onboarding_staff + dispatcher + operator roles. That login's profile is "Marcus Mueller", so the harness driver inherits your name in every roster view.
- It is not your driver account and shares nothing with record #1 — different login, different operator row.

## Unconfirmed

What exactly zeroed the April onboarding flags is not recoverable from the audit log — the log records that status was updated on Apr 24 but not the before/after values. The Jul 31 deactivation likewise has no audit trail, only the fingerprint of a service-role write.

## Proposed next steps (pick any)

1. **Restore your driver record** — set the stage flags back to fully onboarded (screening received/approved, docs received, ICA complete, MO submitted/received, decal + ELD + fuel card yes, insurance date, go-live date), flip `is_active` back to true, and mark the application approved/non-draft so it stops sitting in the pending queue.
2. **Clean up HARNESS-1** — delete the demo operator outright, or rename its display label to something like "ELD Test Harness" so it stops appearing as a second Marcus Mueller in Driver Hub and Vehicle Hub.
3. **Stop the recurrence** — make the demo/harness provisioning path stamp a distinct name on the driver record instead of inheriting the creating staff member's profile name, and add an audit entry whenever a service-role script deactivates an operator, so a silent deactivation can't happen again.

Say which of these you want and I'll write the migration and code changes.