# Multi-day absence entry, including upcoming days

## What already works today — past and current dates

Dispatch and management can already record a reason across a stretch of days, for any dates up to today. On each driver's calendar — in both the cards view and the table view — a gold **Range** button opens a small form: From date, To date, a status (Dispatched / Home / Truck Down / Not Dispatched), one reason, and one note. Saving writes every day in that span as a single entry, and the Absence Log below reads it back as one stretch, e.g. "Sep 14 – Sep 18 · 5 days · Home Time".

So multi-day entry for past and current dates needs no change — it is live now.

## The one real gap

The Range tool refuses any date later than today. A dispatcher who knows a driver is home next Monday through Friday cannot record it in advance. That is what this plan fixes.

## The change

- Range accepts a To date (and From date) in the future, up to one year ahead.
- Future days are written to the driver's calendar and shown in the Absence Log as **Planned**, so a scheduled absence is visibly different from one that already happened.
- Today's live dispatch board is left alone by a future-only entry — it only updates when the range actually includes today, exactly as now.
- The Absence Log's day totals count days that have happened. Planned days are listed and totalled separately, so a vacation booked for December does not inflate this month's off-road count.
- Everything else stays as it is: who can enter it, the reason list, the "Other requires a note" rule, the overwrite toggle, and the driver-facing side (drivers still do not see the reasons).
