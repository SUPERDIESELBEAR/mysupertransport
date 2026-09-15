# Can the audit / email tenancy stop be lifted?

Read-only. Nothing changed. Every number below comes from a live query run just now.

Short answer: **the stop stands for both tables, but for a better-established reason than the pass gave.** Deriving from the entity recovers 121 of the 1,077 rows and leaves 956 that no path can place. The largest groups fail for structural reasons, not for lack of effort.

## 1. How many of the 1,077 resolve from their entity

Entity-first derivation, using each entity type's own table (and, where the record is gone, the `operator_id` kept in the row's stored details):

| entity_type | rows | resolves from entity | resolves only from stored details | residue |
| --- | --- | --- | --- | --- |
| operator | 446 | 50 | 0 | 396 |
| pei_request | 296 | 0 | 0 | 296 |
| application | 211 | 0 | 0 | 211 |
| rods_day | 63 | 0 | 63 | 0 |
| ica_contract | 45 | 0 | 0 | 45 |
| accessorial_adjustment | 5 | 4 | 0 | 1 |
| compliance | 3 | 0 | 0 | 3 |
| dispatch_settlements | 3 | 1 | 0 | 2 |
| invoices | 1 | 1 | 0 | 0 |
| settlements | 1 | 1 | 0 | 0 |
| onboard_assignment_sheet | 1 | 0 | 1 | 0 |
| truck_dot_inspections | 1 | 0 | 0 | 1 |
| truck_owner | 1 | 0 | 0 | 1 |
| **total** | **1,077** | **57** | **64** | **956** |

**Residue: 956 rows** resolve from neither actor, nor entity, nor stored details. That is 24% of the whole table (3,991 rows).

The 396-row operator residue is not a lookup failure: **390 of those 446 rows have no `entity_id` at all.** The column is nullable and a large share of system-written rows never set it. Entity-first derivation cannot help rows that name no entity.

## 2. Types that cannot resolve at all, by design

- **application — 211 rows.** `applications` is declared GLOBAL and has no company. 146 of the 211 point at a live application row; the company simply is not there to read. Unfixable without reversing the GLOBAL decision.
- **pei_request — 296 rows.** `pei_requests` has no company either, and its only parent is `application_id` — i.e. it inherits from a GLOBAL table. All 296 point at live rows. Also unfixable at present.
- **compliance (3) and truck_owner (1)** — `compliance` is not a table at all; the single `truck_owner` row has a null `entity_id`.

That is **511 rows structurally unplaceable**, over half the residue.

## 3. Deleted entities — and a worse finding

Audit rows do outlive their subjects: 6 operator rows, 1 accessorial adjustment, 2 dispatch settlements, 1 DOT inspection and 1 assignment sheet point at IDs that no longer exist.

More importantly, two entity types **do not mean what their name says**:

- **`ica_contract` (885 rows table-wide): `entity_id` is an OPERATOR id, not a contract id.** 840 of 885 match `operators.id`; **zero** match `ica_contracts.id`. Within the underivable 45, none match either table.
- **`rods_day` (67 rows): `entity_id` matches nothing** — not `rods_days`, not `operators`. All 67 are `rods_day_purged` actions; the day was deliberately destroyed and the operator survives only inside the stored details.

So entity-first derivation is not one rule. It would be a per-`entity_type` mapping table, with two entries that contradict their own labels and would silently produce wrong companies if written naively.

## 4. Recommended shape

**Recommendation: leave `audit_log` GLOBAL, and record why.**

- *Actor, then entity, then refuse* — refuses 956 of 3,991 rows. Backfill cannot complete, so `NOT NULL` is unreachable. Rejected.
- *Nullable `company_id`* — breaks the pattern every migrated table follows. Nothing can enforce the meaning of the null: the same null would cover "system action", "GLOBAL entity by design", "entity_id never set", and "a later writer forgot". No trigger can distinguish those, so the column would carry a meaning no check can defend. Rejected on that ground, as your framing requires.
- *GLOBAL* — honest about what the table is: append-only shared infrastructure whose subjects include GLOBAL entities. Access stays governed by the existing management/staff read policies, which are role-based and do not leak per-row financial data. When a second carrier appears, scope reads through the *entity* at query time, where the mapping ambiguity can be handled explicitly rather than frozen into a backfill.

If GLOBAL is adopted, three things should be enforced by guard: no `company_id` ever appears on `audit_log`; the residue count stays non-zero (so the decision cannot be quietly outlived); and the `ica_contract` / `rods_day` label-vs-content mismatch is asserted so a future pass cannot assume the obvious join.

## 5. `email_send_log` — separately

Paths tested:

- **`operator_id` in stored details — 414 of 2,058 rows, all 414 resolve to a live operator.** A real path, for 20% of the table.
- **`application_id` in stored details — 278 rows.** Dead end: `applications` is GLOBAL.
- **Recipient address against `applications.email` — 1,079 of 2,058 match.** Also a dead end, same reason. `profiles.email` and `operators.email` genuinely do not exist; that part of the pass was right.
- **Template name — no.** The 1,340 rows with no stored details are dominated by `pei-request-follow-up` (432), `pei-request-initial` (259), `eld_escalation_day` (220), `recovery` (126), `eld_ack_overdue` (80), `invite` (75). PEI and invite templates are precisely the applicant-stage traffic that has no operator and no company.

So a path exists for about 20% of rows and no path exists for the rest. **Recommendation: leave `email_send_log` GLOBAL** with the reason recorded — it is service-role-only in and out (all four policies check `auth.role() = 'service_role'`), it is deliverability infrastructure rather than tenant data, and most of its volume concerns applicants who have no carrier yet.

## Contradictions worth stating

1. The pass's underivable breakdown listed **operator 446, pei_request 296, application 211, rods_day 63, ica_contract 45**. Those match today. But the pass's totals (3,991 / 1,077 / 1,021) are a snapshot; the table grows. Table-wide `entity_type` counts today are operator 1,527, ica_contract 885, application 798.
2. The premise "an audit row about operator X belongs to operator X's carrier" is sound. It just does not reach this data: the two biggest groups name GLOBAL entities, and the third names no entity at all.
3. Nothing here is a cross-carrier isolation claim. One carrier row exists.

## If you want the stop lifted anyway

The only route that makes `audit_log` per-company without a nullable column is to give `applications` and `pei_requests` a company first. That is a reversal of the GLOBAL declaration, not an audit-log task, and would want its own pass.
