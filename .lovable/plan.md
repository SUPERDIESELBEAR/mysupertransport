# Fuel Import column visibility — findings (read-only)

## Verdict: reporting error, not a defect

The Discount column **does render** for the real 2026-09-05 file. The previous pass's
statement ("only Fuel, Advances and Other carry money there") was wrong about Discount.
No negative-comparison bug exists: the visibility check compares `!== 0`, not `> 0`.

## How this was determined

Not by reading code. The 69 committed rows of that file were pulled from the database
(`fuel_transactions` + `fuel_transaction_lines`, 2026-08-28 through 2026-09-01, 69 rows),
rebuilt into parsed rows, and passed through the real `buildDisplayRows` and
`visibleMoneyColumns` functions unchanged. All 69 rows joined to a parsed twin, so the
split values are the real ones.

Database cross-check: 39 rows carry a non-zero `fuel_discount_amount`, totalling
**-$533.63** — exactly the figure quoted.

## Per money column, over the whole real file

| Column | Renders | Non-zero rows | Sum |
| --- | --- | --- | --- |
| Fuel | yes | 69 | $31,850.16 |
| Advances | yes | 1 | $505.00 |
| Repairs | no | 0 | $0.00 |
| Other | yes | 4 | $92.13 |
| Discount | yes | 39 | -$533.63 |
| Unexplained | no | 0 | $0.00 |

No column carrying money is hidden. Only Repairs and Unexplained are hidden, and both are
zero on every one of the 69 rows — which is the intended rule.

## One unrelated observation, not acted on

The single $5.00 `fees` line lands in **Advances** ($505.00 = $500.00 cash advance + $5.00 fee)
rather than Other. That is the existing bucket mapping in `fuelBuckets.ts`, unchanged by
any recent pass. Flagging it only because it surfaced while running the numbers.

## Proposed follow-up (nothing changed yet)

1. Correct the Module 6 Pass 10 entry in `docs/tms-build-status.md`: the hidden columns on the
   real file are Repairs and Unexplained only, not Discount.
2. Add a regression test that runs `visibleMoneyColumns` over a fixture containing a negative-only
   column, asserting a negative-valued column renders — so the claim is enforced, not asserted.
3. Decide separately whether the `fees` line belongs in Advances or Other.
