# Accurate Management Overview Metrics

Make the Overview cards match exactly what the roster and dispatch views show — no archived, demo, or historical records inflating the numbers.

## In Onboarding

- Count only: active, non-demo, non-owner drivers who are not yet fully onboarded and not on hold.
- Current true count: **12** (today it shows 72 because it counts every historical operator row that was never marked complete).
- Add a muted "N on hold" line under the number so on-hold drivers stay visible but are excluded from the main total.
- The stage breakdown badges (BG / Doc / ICA / Equip / Go Live) use the same eligibility rule, so the badges always add up to the big number.

## Active Drivers

- Definition: every fully onboarded, active, non-demo driver — i.e. exactly the drivers that appear in the Driver Hub roster.
- Current true count: **42** (today it shows 49 because it counts dispatch rows instead of drivers).
- Clicking the card continues to open the Driver Hub roster filtered to those same drivers.

## Active Dispatch

- Definition: drivers whose status in the Driver Hub is **Dispatched**.
- Current true count: **26**.
- The supporting chips (Home, Truck Down, Not Dispatched) stay as a secondary breakdown of the remaining onboarded drivers, and any onboarded driver with no dispatch record is treated as **Not Dispatched** so the breakdown covers all 42.

## Alerts

- Apply the same active / non-demo / onboarded filters so archived or sandbox records can no longer raise alerts.

## Technical notes

- Add one shared eligibility predicate (active, not demo, not owner-only, onboarding state) in the management metrics layer and use it for every card, chip, and badge in `src/pages/management/ManagementPortal.tsx`.
- Active Drivers derives from the operator roster query, not from `active_dispatch`; dispatch status is joined in for the Dispatched count and breakdown, defaulting missing rows to `not_dispatched`.
- Card click-throughs keep passing the same filter parameters used by the roster/pipeline views so the destination list length equals the number on the card.
