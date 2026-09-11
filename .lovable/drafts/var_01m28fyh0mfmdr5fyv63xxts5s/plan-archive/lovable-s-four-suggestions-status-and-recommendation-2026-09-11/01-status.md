# Lovable's four suggestions — status and recommendation

## 1. Driver-facing reminder notices — ALREADY BUILT

`cron-inspection-reminders` runs daily and sends each assigned driver an in-app
notification (and email) at three points: 30 days before their inspection month,
14 days before month end, 3 days before month end. It already uses the grace date
as the deadline when one was granted. One send per driver per stage, no repeats.
Nothing to do here.

## 2. Clean roadside bonus in settlement lines — NOT BUILT (worth building)

Half exists: `inspectionBonus.ts` evaluates eligibility (clean = zero violations,
$100/$50/$25 by level, 24-hour report window) and the Roadside Stop form captures
the case number. But nothing reaches the settlement engine — an eligible driver
is never actually paid the bonus.

**Proposed build:** when staff verifies a clean roadside stop, queue a settlement
line item for the driver's current work week, showing the bonus amount and case
number, subject to the existing 24-hour window check. It appears on the driver's
settlement like any other line item.

## 3. Grace-period limits with driver requests — PARTIALLY BUILT

Staff side exists: Vehicle Hub grants a grace period, enforces the cap of two per
12 months (further extension needs management approval), and shows grace status on
the cycle. What does not exist: a way for the **driver** to request an extension —
today only staff can grant one, unasked.

**Proposed build:** a "Request extension" action on the driver's own inspection
view, capped at one per cycle, landing as a pending request in the Vehicle Hub for
staff to approve or decline.

## 4. Inspection submission in Vehicle Hub — ALREADY BUILT

The quarterly inspection panel requires the inspection report and an itemised
invoice (rejects save without them), records the submission date, and the cycle
status distinguishes submitted / awaiting repair documentation / closed / overdue.
Operators upload from their portal. Nothing to do here.

## Recommendation

Build **#2** (drivers are owed money the system never pays) and **#3** (removes a
phone call for a routine ask). #1 and #4 are done.
