# Pass report — 2026-09-15 23:10 UTC

## Scope

Documentation and guards only. Record the read-only investigation of whether
the B7 stop on `audit_log` and `email_send_log` can be lifted by deriving the
company from the entity the row describes. No DDL, no client changes.

## Live facts (queried this pass)

`audit_log` 3,991 rows, 1,021 null `actor_id`; `email_send_log` 2,058 rows,
1,340 with null `metadata`.

### Entity derivation arithmetic (audit_log)

Of the 1,077 actor-underivable rows, entity-first derivation recovers 121 and
leaves **956 (24% of the table)** that resolve from neither actor, nor the
named entity, nor an `operator_id` in stored details:

| entity_type | rows | by entity | by stored details only | residue |
| --- | --- | --- | --- | --- |
| operator | 446 | 50 | 0 | 396 |
| pei_request | 296 | 0 | 0 | 296 |
| application | 211 | 0 | 0 | 211 |
| rods_day | 63 | 0 | 63 | 0 |
| ica_contract | 45 | 0 | 0 | 45 |
| accessorial_adjustment | 5 | 4 | 0 | 1 |
| dispatch_settlements | 3 | 1 | 0 | 2 |
| compliance | 3 | 0 | 0 | 3 |
| invoices | 1 | 1 | 0 | 0 |
| settlements | 1 | 1 | 0 | 0 |
| onboard_assignment_sheet | 1 | 0 | 1 | 0 |
| truck_dot_inspections | 1 | 0 | 0 | 1 |
| truck_owner | 1 | 0 | 0 | 1 |

Structural causes: 511 rows name entities on GLOBAL tables (`application` 211,
`pei_request` 296 — whose only parent, `application_id`, is itself GLOBAL);
390 of the 446 `operator` rows have a NULL `entity_id`; deleted entities
account for a handful (expected in an append-only audit log).

### Decision

- `audit_log` STAYS GLOBAL. Actor-then-entity-then-refuse was rejected because
  the backfill cannot complete (NOT NULL unreachable). Nullable `company_id`
  was rejected because no trigger can distinguish "system action" from "GLOBAL
  entity by design" from "`entity_id` never set" — a column carrying a meaning
  no check can defend. Forward path: scope audit reads through the entity AT
  QUERY TIME when a second carrier appears.
- `email_send_log` STAYS GLOBAL. One path exists (`operator_id` in stored
  details) and reaches only 414 of 2,058 rows; `application_id` and
  recipient-address joins dead-end on GLOBAL `applications`; the 1,340
  detail-less rows are dominated by PEI and invite mail (applicant stage, no
  carrier). All four policies are service-role-only. Deliverability
  infrastructure, not tenant data.

### Label-mismatch finding (recorded separately — not a tenancy matter)

- `audit_log.entity_id` where `entity_type = 'ica_contract'` holds an OPERATOR
  id: 840 of 885 match `operators.id`, ZERO match `ica_contracts.id`, table-wide.
- `entity_type = 'rods_day'` matches nothing in `rods_days` or `operators`; all
  are `rods_day_purged` actions and the operator survives only in
  `metadata.operator_id`.

The obvious join returns nothing rather than failing — a trap for any future
query, now documented in `docs/tms-build-status.md` and asserted in the guard.

### The only route that lifts the stop

Giving `applications` and `pei_requests` a company — a reversal of their GLOBAL
declaration, its own pass. Recorded with NO trigger: a consequence to know
about, not work to schedule.

## What was done

- Appended the full decision record to `docs/tms-build-status.md`.
- Added a five-test block `2026-09-15 — audit_log / email_send_log stay GLOBAL`
  to `src/test/tenancy-resolver.test.ts`:
  1. neither table ever gains `company_id`;
  2. the unplaceable residue stays non-zero (the decision cannot be quietly
     outlived);
  3. the email derivation path still leaves the majority unplaceable (shape,
     not census);
  4. the `ica_contract` label mismatch is asserted;
  5. the `rods_day` label mismatch is asserted.

## Guard failure demonstrations (per the green-and-empty rule)

Each guard was deliberately broken, run, watched fail, restored:

```
guard 1: AssertionError: expected [] to deeply equal [ 'audit_log' ]
guard 2: AssertionError: DEMO: expected 956 to be +0 // Object.is equality
guard 4: AssertionError: ... expected [ '840 / 0' ] to deeply equal [ StringMatching /^0 \// ]
guard 5: AssertionError: expected 67 to be +0 // Object.is equality
```

Guard 3's shape check shares the demonstration of guards 2 and 5 (both assert
non-zero counts of the same kind). After restore: the block runs 5 passed.

## Suites

`bunx vitest run src/test/tenancy-resolver.test.ts -t "stay GLOBAL"` — 5 passed.
No typecheck claim: only a test file and documentation changed, and per the
green-and-empty rule a check that cannot be affected is not evidence.

## Contradictions

1. The B7 pass's entity-type breakdown (operator 446, pei_request 296,
   application 211, rods_day 63, ica_contract 45) matches today's data. The
   totals (3,991 / 1,077) are a snapshot; the table grows. The residue guard
   asserts `> 0`, not a census.
2. The premise "an audit row about operator X belongs to operator X's carrier"
   is sound but does not reach this data: the two largest residue groups name
   GLOBAL entities, and the third names no entity at all.
3. Nothing here is a cross-carrier isolation claim. One carrier row exists.
