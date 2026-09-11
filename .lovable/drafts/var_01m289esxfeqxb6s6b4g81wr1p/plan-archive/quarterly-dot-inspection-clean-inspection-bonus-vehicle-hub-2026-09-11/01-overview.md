# Quarterly DOT Inspection & Clean Inspection Bonus — Vehicle Hub tracking

## What the program needs, mapped to what exists

The program document has three mechanical parts, and each one lands on something already built:

| Program requirement | Where it lives |
|---|---|
| Quarterly §396.17 inspection per unit, month assigned by unit number | Vehicle Hub already stores DOT periodic inspections per truck — this adds the schedule and per-cycle status on top |
| Submission (report + itemized invoice) driving a $150 reimbursement | Staff upload into the Vehicle Hub, then a manual review queue pushes approved items to the next settlement |
| Clean roadside bonus ($100/$50/$25 by level) | The roadside stop log already records level, outcome, and violations — clean Level I/II/III stops become bonus candidates |

Nothing is rebuilt. The quarterly layer extends the existing DOT inspection record; the bonus extends the existing roadside stop record.

## Scope (per your answers)

- Full program: core tracking + automated reminders + monthly fleet safety summary
- Staff upload submissions (today's document pattern)
- Money reaches settlements through a manual review queue
- Missed-month units get a visible "not dispatch-eligible" badge — advisory, no hard dispatch block

## The four pieces

1. **Quarterly cycle engine** — every unit is auto-assigned Group A (odd unit number → Oct/Jan/Apr/Jul) or Group B (even → Dec/Mar/Jun/Sep). Each unit shows a per-cycle status: upcoming, due this month, submitted, closed, overdue, or grace period. Launch credit and new-contractor onboarding credit are applied automatically from the existing inspection records.
2. **Submission & closure tracking** — each cycle holds the inspection report, the itemized invoice, the inspection fee amount, and the two defect checkmarks from §11 (defects identified / defects repaired). A cycle is not closed until both are recorded.
3. **Money review queue** — a Management list of completed submissions ($150 inspection reimbursement) and verified clean roadside bonuses ($100/$50/$25). One click pushes an approved item onto the driver's next settlement as a line item. Nothing flows automatically.
4. **Reminders & monthly summary** — automated emails/notifications at 30 days before the assigned month, and 14 and 3 days before it ends; plus a monthly fleet safety summary for staff (completion by group, clean inspections, top violations).
