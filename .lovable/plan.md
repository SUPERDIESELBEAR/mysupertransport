# Let recognized shipment/order codes survive the cross-stop duplicate rule

Today any reference value repeated on more than one stop is dropped as an internal broker code. That is right for opaque labels, but it also throws away the shipment number a guard shack actually asks for — on the AAA document, `SO 2633450554` and `SI R2633450554` appear on both stops and both disappear.

## Change

### 1. Narrow exemption list

A new recognized shipment/order label set — `SO`, `SI`, `PRO`, `ORDER`, `SHIPMENT`, plus the same family already treated as gate references (`BOL`, `PU`/`PICKUP`, `DELIVERY`/`DL`, `PO`, `RELEASE`, `SEAL`, `APPT`/`CONFIRMATION`). A reference whose label matches this set is kept even when the same value appears on every stop.

Everything outside the set — `DJ`, `ZZ`, `F9` and any other opaque or unrecognized shorthand — stays fully subject to the duplicate rule. The exemption never applies to a bare code the parser cannot name.

The separate "duplicates a load-level id" rule is unchanged: a stop reference that merely restates the BOL, PO, or broker load number is still dropped, exempt label or not, since that number already has a home on the load.

### 2. Collapse near-duplicates

Two surviving references that differ only by a leading or trailing alphabetic prefix or suffix are the same reference written twice (`SI R2633450554` vs `SO 2633450554`). Keep one.

The keeper is chosen by how explicit its label is about what the number is: a spelled-out label (`Shipment #`, `Order #`) beats a known abbreviation (`SO`, `PRO`), which beats anything else; ties break toward the shorter, unprefixed value, since that is normally the number as printed in the shipper's system.

Collapsing happens per stop, after the duplicate and load-id rules, so it operates on what actually survived.

### 3. Distinct log line for exempted survivors

The drop log currently only records discards. Add a separate line naming each reference kept by way of the exemption, e.g.

```text
parse-rate-confirmation: shared references kept — stop 1: "SO"=2633450554 [recognized shipment/order label]
```

and a line for each near-duplicate collapsed away, so a missing value is always traceable to a decision rather than a gap. A shared value deliberately kept is now as visible in the logs as one that was dropped.

### 4. Client-side gate label

The Create Load form independently filters which surviving reference is promoted into a stop's reference field, and its allowlist does not currently recognize `SO` or `SI` — so a kept shipment number would still land nowhere. The two lists are brought into agreement so the exemption has a visible effect on the form.

## Verification

Re-parse the real AAA PDF and report, per stop, exactly what lands in the reference field and what the drop log says — including which of `SI R2633450554` / `SO 2633450554` won and why, and confirmation that `DJ 1012323`, `ZZ`, `F9` and the coordinates are still gone. Run the test suite.

## Technical notes

- `supabase/functions/parse-rate-confirmation/index.ts`: new `SHIPMENT_REF` label regex; the cross-stop duplicate filter (around lines 388-402) consults it before dropping; a new near-duplicate collapse pass after it; `keptRefs` log array alongside the existing `droppedRefs`.
- `src/lib/rateConfirmation.ts`: extend `GATE_LABEL` with the recognized shipment/order codes.
- No schema, UI, or save-path changes.
