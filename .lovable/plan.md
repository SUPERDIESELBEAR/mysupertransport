# Late Accessorials — the screen, and the rules the database must enforce

Five protected writers exist and nothing can reach them. This pass gives them a
screen, and changes three rules first, because a screen that hides a button is
not a control.

## The rules that change (database first)

**1. A dispatcher approval limit, as a setting.**

New column on `settlement_settings`, beside `minimum_net_pay_threshold`,
`hold_buffer` and `equipment_value_per_driver`:

- name: `dispatcher_accessorial_approval_limit` (numeric, dollars)
- **the owner sets the value.** The migration does not pick one; the column
  arrives `NULL`, and `NULL` means *dispatchers approve nothing* — the rule
  stays exactly as it is today until a number is entered. It is edited on the
  existing Settlement Settings screen, which already writes this table and
  already keeps a history of changes.

`approve_accessorial_adjustment` is rewritten to read the setting and refuse a
dispatcher whose adjustment is at or above the limit, naming the limit in the
refusal. Management and owner are unaffected. Rejecting and voiding stay
management/owner only — a dispatcher who may sign off a small one may still not
kill someone else's.

**2. Proof becomes mandatory, at every amount.**

`proof_document_id` is nullable today. It becomes required to *submit* — a draft
may exist without it, so an entry can be started while the email is being
chased. What counts as proof depends on the charge type, checked in the
database:

| charge type | proof expected |
|---|---|
| detention, layover, tonu, stopoff | the broker's written agreement |
| lumper, reimbursement | the receipt |
| linehaul, fsc, other | any attached document |

The distinction is recorded on the row so the list can show what was relied on.
The document must belong to the load — that check already exists in the create
function and is reused.

**3. Nothing else about the state machine moves.**

Amount, classification, load and reference stay frozen once approved. Settled
stays unreachable from any screen. The `-A1` reference is still allocated inside
the create function and never offered to the user.

## The screen

**Entry point: the load page.** A Late Accessorials section on a load whose
money is frozen, with a "Record late accessorial" action. Charge type, amount,
written reason, description, funding source, and the proof attachment. The
reference appears only after it saves.

**Review: a Late Accessorials list** under Management, and visible to
dispatchers too. Columns: reference, load, charge type, amount, status, who
recorded it, how long it has waited. Filters by status. Opening one shows the
full history from the audit log, including the reason for a rejection, which
lives there rather than on the row.

**Actions offered, and only these:** submit (draft), approve / reject (pending,
and only when the signed-in person may), void (anything not settled). Each opens
a reason box, because every one of the five writers refuses a blank reason. An
approved row shows no edit — only void and re-enter, which is what the record
requires.

**Alerts, all three:**

- the notification bell when one is submitted, to whoever may approve it
- a count on the sidebar item
- a banner when something has waited more than a day

## Where this stops

The origin stays manual: a dispatcher records it from the load and attaches the
broker's email as a file or screenshot. Nothing parses incoming mail, and the
empty detention claims table is left alone.

## Technical notes

- Migration: `settlement_settings.dispatcher_accessorial_approval_limit numeric
  NULL`; rewrite `approve_accessorial_adjustment` (limit + role) and
  `submit_accessorial_adjustment` (proof required, per charge type); keep both
  `SECURITY DEFINER`, pinned search path, mandatory reason, audit row.
- Read access already exists: one company-scoped SELECT policy for
  dispatcher/management/owner. No new policy needed; there is still no client
  write path outside the five functions, which is the intent.
- Notifications go through the existing `notifications` table and bell, not a
  new mechanism.
- `billing_state` is displayed, never set — it is a fact about the invoice,
  written once at create.
- Tests: the limit boundary (below, at, above), a dispatcher refused above it, a
  `NULL` limit refusing every dispatcher approval, submit refused without proof
  for each charge-type group, and the existing 49 schema assertions kept green.
  Live verification against the two `ST-TEST-005` rows.

## Open, and yours to decide

The limit's value. Everything else here is settled.
