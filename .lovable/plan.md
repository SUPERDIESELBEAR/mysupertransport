# Fuel statement: does it still add up when the discount is hidden?

Read-only investigation. Nothing was changed. Ali Mohamed's statement was generated
from his three real purchases both ways.

## Short answer

No. With the discount hidden, the statement no longer adds up. The Total stays NET
(after the discount), while the visible columns still add up to the GROSS. The
difference is exactly the hidden discount: **$10.16** on Ali Mohamed.

## 1. What the Total shows when the discount is hidden

Net, in both places:

- Row "Total" cell: the amount the card was charged after the price reduction.
- Totals block headline: $1,960.56 — the sum of those net amounts.

Hiding the discount removes the Discount column, the per-row cell and the Discount
line in the totals block. It changes no other figure. The Fuel / Cash advance /
Repairs / Other figures are built from the gross and are unchanged.

## 2. Do the visible columns sum to the visible Total?

Discount SHOWN — yes, everywhere.

```text
Row  Flying J   Fuel 514.08 + Discount -8.12            = Total  505.96  OK
Row  Pilot      Fuel 122.30 + Cash 505.00 + Disc -2.04  = Total  625.26  OK
Row  Love's     Fuel 829.34 (no discount)               = Total  829.34  OK
Block           1,465.72 + 505.00 - 10.16               = 1,960.56       OK
```

Discount HIDDEN — no, on every row that had a discount, and in the block.

```text
Row  Flying J   Fuel 514.08                    vs Total  505.96   off by 8.12
Row  Pilot      Fuel 122.30 + Cash 505.00      vs Total  625.26   off by 2.04
Row  Love's     Fuel 829.34                    vs Total  829.34   OK (no discount)
Block           1,465.72 + 505.00 = 1,970.72   vs Total 1,960.56  off by 10.16
```

## 3. The gap, named and sized

The gap is the hidden fuel discount, unlabelled and unexplained: **$10.16** across
Ali Mohamed's three purchases ($8.12 Flying J, $2.04 Pilot, $0.00 Love's). A driver
adding his own column reaches $1,970.72 and the statement says $1,960.56.

Note which side reconciles: $1,970.72 is the gross — and the gross is what is
deducted from his pay in every state. So the figure the visible columns already
sum to is also the figure that actually left his settlement. The document prints
the other one.

The same shape as the fuel import screen balance: buckets built on the gross,
headline built on the net, the bridging line removed from view.

## Where this comes from

- `buildDriverRow` fills Fuel / Cash advance / Repairs / Other from
  `fuelBucketLines`, which is fed the GROSS (`total − discount`), and sets
  `total` to the NET `total_amount`. The Discount cell is the bridge between them.
- `buildFuelPdfDocument` with `showDiscount: false` drops only the Discount column
  and the Discount breakdown line; `amount` stays `formatCurrency(totals.total)`,
  the net.
- The My Fuel screen does the same thing: same row builder, same totals, Discount
  line hidden behind the same flag — so the on-screen version has the identical gap.
- Settlement is unaffected either way: the deduction is the gross.

## Open question — not decided here

If this is fixed, the choice is which figure the hidden state should print:

1. Show the gross as the Total when the discount is hidden. Adds up, and matches
   what left his pay. The Total then differs from the card receipt he holds.
2. Keep the net and add a neutral bridging line. Adds up, but re-reveals the
   reduction's size, which is what hiding it was for.
3. Leave it. The statement stays internally contradictory by $10.16 for any driver
   with a discount and pass-through off.

Say which, and I will plan the change.
