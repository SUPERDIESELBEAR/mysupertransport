# Broker match detail + duplicate broker detection

## 3. Current duplicate state (answered first — nothing changed)

The brokers table holds 6 records. Exactly one duplicate group:

| Name | MC | Records | Referenced by loads? |
| --- | --- | --- | --- |
| BlueGrace Logistics | none on either record | 2 (created 12:24:59 and 12:28:02 on 8/21) | No — zero loads on either |

Both BlueGrace rows are identical: same name, no MC number, no city/state, primary contact "Sean Grogan", factoring status unknown, both active. Neither is referenced by any load, so both are orphans — the cleanup is a free choice between them.

No other name or MC value repeats. Loads currently reference only Test Broker Alpha (3), Test Broker Beta (2), and Cahaba Transportation (1), plus one load with no broker. Nothing is deleted or merged by this plan.

## 1. Distinguishing detail on candidate rows

Each candidate row in the parse panel grows into a two-line block:

```text
BlueGrace Logistics                        [MC confirmed]   [Use this broker]
MC 123456 · Tampa, FL · Sean Grogan
```

Every one of the four fields is always rendered — a missing one reads `MC — not on record`, `City/state — not on record`, `Contact — not on record` in muted text, so an absent MC is visible rather than silently dropped.

The candidate query widens to also fetch `dot_number`, `city`, `state`, `primary_contact_name`.

## Confidence labeling

Today both BlueGrace rows read "Name match 100%", which overstates what a name proves. New labels:

- Candidate MC equals the document MC (digits compared) — **MC confirmed**, gold-emphasized badge, sorted to the top of the list, with a short line: "MC number matches the document."
- Document has an MC and the candidate has a different MC — **Different MC** badge, kept in the list but sorted last with a caution tone, since it is probably not the same authority.
- Document has an MC and the candidate has none — **Name match only · no MC on record**.
- Document has no MC — **Name match only**, no percentage shown.

The raw percentage stops being surfaced as a confidence number; ordering still uses the score internally. An MC-confirmed candidate always outranks any name-only candidate.

## 2. Duplicate detection on broker creation

Warn, never block. No database uniqueness constraint.

New matcher in `src/lib/brokerDuplicates.ts`: given the dialog's company name and MC number, find existing brokers matching on normalized MC digits, or — when the new record has no MC — on normalized company name (lowercased, punctuation and legal suffixes such as Inc/LLC/Logistics-agnostic comparison reusing the existing name-scoring helper at a high threshold). Returns the matches with their distinguishing detail.

`BrokerDialog` behavior:

- On submit, run the check before inserting. If matches are found, do not insert; instead show a warning panel inside the dialog listing each match with the same two-line detail block used in the parse panel, and per match a **Use this broker instead** action, which selects that broker on the load form and closes the dialog.
- Below the list: **Create anyway** with a required short reason ("different authority", "unrelated company with a similar name"). Reason is recorded in `audit_log` alongside the new broker id and the id(s) it was warned against, so a later cleanup can see the dispatcher's judgment.
- If no match, insert exactly as today.

This applies to both entry points, since `BrokerSelect` and the parse panel share the dialog.

## Technical details

- `src/lib/rateConfirmation.ts`: `BrokerCandidate` gains `dot_number`, `city`, `state`, `primary_contact_name` and a `mcStatus: 'confirmed' | 'different' | 'absent' | 'no-doc-mc'` field; `matchBroker` widens its select, stops early-returning only MC hits (it now returns MC hits plus name hits merged and deduped), and sorts MC-confirmed first.
- New `src/components/dispatch/loadForm/BrokerCandidateRow.tsx` renders one candidate (detail lines, badge, action button) and is used by both the parse panel and the duplicate warning inside `BrokerDialog`.
- New `src/lib/brokerDuplicates.ts` with `findBrokerDuplicates({ company_name, mc_number })`; unit tests in `src/lib/__tests__/brokerDuplicates.test.ts` covering MC-digit equality, name-only match when MC absent, suffix-insensitive name comparison, and no-match.
- `BrokerDialog` gains internal state for pending duplicates and the override reason; `onCreated` is also invoked when the dispatcher picks an existing record, so callers need no change.
- Audit write uses the existing `audit_log` insert pattern; no schema changes and no migration.
