# Overview cards: make the numbers match reality

## Where 72 comes from

The "In Onboarding" card counts **every operator record ever created** whose onboarding is not marked complete — including deactivated/archived drivers, on-hold drivers, demo/test accounts, and the two owner test accounts. There is no `is_active` filter on that query at all.

Verified against live data right now:

| Population | Count |
|---|---|
| All operator records | 144 |
| Not fully onboarded (what the card shows today) | **72** |
| Active operators | 62 |
| Active, not fully onboarded | 20 |
| Active, not fully onboarded, not on hold — what the Pipeline actually lists | **12** |

So 72 is inflated mainly by 82 inactive/archived records, plus 8 on-hold drivers.

## The other three cards, checked

- **Pending Applications = 8** — correct, matches the Applications list.
- **Active Drivers = 49** — wrong. It counts rows in the dispatch table without checking whether the operator is still active or a demo account. Active, non-demo, fully onboarded drivers: **42**. Dispatch rows for active non-demo operators: 35 (some active drivers have no dispatch row yet).
- **Alerts = 0** — correct today (no denied background checks or non-clear PE results), but it has the same missing filters, so it will over-count as soon as an archived driver has a denied result.
- **Stage breakdown badges on the In Onboarding card** (BG / Doc / ICA / MO / EQ / Ins) and the "Idle 14d+" chip are built from the same unfiltered operator pull, so they are inflated the same way.

## What to change

One shared definition of "who counts", applied to every Overview number so the cards agree with the pages they link to.

1. **In Onboarding** — count operators that are active, not a demo account, not on hold, not an owner test account, and not fully onboarded. Today that is 12. This exactly matches the rows the Onboarding Pipeline lists.
2. **Stage breakdown badges + Idle 14d+** — apply the same population before computing stage buckets, so each badge equals what the Pipeline shows when you click it.
3. **Active Drivers** — count distinct active, non-demo, fully onboarded drivers (42), not dispatch rows. The dispatch-status chips underneath keep counting dispatch state but over the same driver set.
4. **Alerts** — add the same active/non-demo filter so archived records can never raise an alert.
5. **On-hold visibility** — on-hold drivers are excluded from the In Onboarding number, as requested. Add a small muted "N on hold" note under the card so they aren't invisible.
6. **Demo accounts** — respect the existing staff "Show demo" toggle: excluded by default, included when the toggle is on, consistent with the Pipeline.

## Technical notes

- All changes are in `src/pages/management/ManagementPortal.tsx`: `fetchMetrics` (lines ~660-673) and `fetchStaffWorkload` (the `opsData` pull at ~575).
- Extract the eligibility predicate (active, non-demo, not on hold, not owner test IDs) into one helper shared by both, mirroring the Pipeline's `matchesFilters` baseline exclusions and `OWNER_USER_IDS` list.
- Counts become client-side over a single filtered operator fetch rather than four independent `count: 'exact'` queries, so the card totals and badges are guaranteed to come from the same rows.
- No schema, RLS, or edge-function changes.
