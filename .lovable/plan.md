# Broker match detail + duplicate broker detection

## Confirmation of your diagnosis

Confirmed. The two `BlueGrace Logistics` rows were created 8/21 at 12:24:59 and 12:28:02 UTC — about three minutes apart, both with no MC number, no city/state, no contact, and no `created_by`. No load references either one (loads reference only Test Broker Alpha, Test Broker Beta, Cahaba Transportation, plus one load with no broker). That matches parse-panel creation, not load creation: the old "Create new broker from document" button inserted on a single click with no dialog.

The already-approved dialog change closes that exact path (nothing is written until explicit confirm). The duplicate detection below closes it generally. Both BlueGrace rows are orphans, so cleanup is a straight delete of one — nothing to re-point. No deletion happens in this plan.

## 1. Distinguishing detail on broker candidates

`matchBroker` widens its select to include `dot_number`, `city`, `state`, `primary_contact_name`, and stops returning early on an MC hit so name candidates still surface alongside.

Each candidate row shows, always, one line per field — missing values render as muted "not on record" rather than being omitted:

```text
BlueGrace Logistics                     [MC confirmed]
MC 123456  ·  Tampa, FL  ·  Contact: Jane Doe
```
```text
BlueGrace Logistics                     [Name match only]
MC — not on record  ·  City/state — not on record  ·  Contact — not on record
```

## 2. MC number is authoritative

- A candidate whose MC digits equal the parsed document's MC is badged `MC confirmed` (gold emphasis) and sorted to the top.
- Name-only candidates are badged `Name match only` with no percentage. The current "Name match 100%" label is removed — it overstated confidence on a name-only comparison.

New shared component `src/components/dispatch/loadForm/BrokerCandidateRow.tsx` renders this, used by both the parse panel and the duplicate warning so the two always look the same.

## 3. Duplicate detection on broker creation (warn, never block)

New `src/lib/brokerDuplicates.ts`: before insert, look for existing brokers matching on normalized MC digits, or — when the new record has no MC — on normalized company name.

`BrokerDialog` behavior on confirm:
- No match: insert as today.
- Match found: the dialog swaps to a warning panel listing each match as a `BrokerCandidateRow`, with two paths:
  - **Use this broker instead** — no insert; the existing id is selected on the load form.
  - **Create anyway** — requires a typed reason; the insert proceeds and the reason plus the matched broker ids are written to `audit_log`.

No database uniqueness constraint is added.

## Technical notes

- Files: `src/lib/rateConfirmation.ts` (matchBroker), new `src/lib/brokerDuplicates.ts`, new `BrokerCandidateRow.tsx`, `BrokerDialog.tsx`, `RateConfirmationParser.tsx`.
- MC normalization strips non-digits for comparison so `MC 123456`, `123456`, and `mc-123456` collapse to one value.
- Name normalization lowercases, collapses whitespace, and strips **only genuine legal entity suffixes** — Inc, LLC, L.L.C., Ltd, Corp, Co, LP, LLP and punctuated variants. Industry words (Logistics, Transport, Transportation, Freight, Trucking, Carriers, Express) are left in place, so "Smith Logistics" and "Smith Trucking" stay distinct. A missed duplicate warning is acceptable; a false one is not.
- Audit rows use the existing `audit_log` shape (action `broker_duplicate_override`, target the new broker id, details carrying the reason and matched ids).
- Unit tests in `src/lib/__tests__/brokerDuplicates.test.ts`: MC match wins over name, name match only when MC absent, unrelated names do not match, MC-confirmed sorts first. Full suite run at the end.

## 4. Orphan cleanup

Delete the later BlueGrace row (`811b3641-7701-49a3-8b0f-6f88d9a9e1f2`, created 12:28:02) and keep the earlier one (`7d07acfd-5485-489b-aacc-ce099b3c2373`, created 12:24:59). Both are unreferenced by loads, so no re-pointing is needed. Done via migration.

The kept record is left exactly as-is — name only, no MC number, city, state, or contact — so you can populate it through the new BrokerDialog and confirm the duplicate detection recognizes it on the next Blue Grace parse. Its emptiness is verified after the delete and reported back.
