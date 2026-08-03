# Overview cards: make every chip a real filtered drill-down

Your read is right, and there's a second problem behind it: some chips aren't clickable at all, and the ones that are can land on an empty list because the Overview counts and the Driver Hub filters are computed from different data with different day thresholds. That's why clicking "3 exp" showed "No active drivers found" in your screenshot.

## What's happening today

**In Onboarding card** — the stage badges (BG, Doc, ICA, MO, EQ, Ins) and "Idle 14d+" already navigate to the Pipeline with the right filter applied. No change needed there.

**Active Drivers card** — two rows of chips behave differently:
- Dispatch chips (On Road / Home / Available / Down) are plain, non-clickable labels. Clicking does nothing.
- Compliance chips (exp / crit / warn / miss) do navigate to Driver Hub with a filter, but the filter often shows zero drivers.

**Why the counts don't line up**

| | Overview card | Driver Hub |
|---|---|---|
| Source of dates | binder documents (CDL Front / Medical Certificate) | operator record's CDL & Med Cert expiration fields |
| Counted per | each document (a driver with two bad docs counts twice) | each driver, once |
| "crit" / "Critical" | within 30 days | within 7 days |
| "warn" / "Warning" | within 90 days | within the configured window (30 days) |
| Labels | exp, crit, warn, miss | Expired, Critical ≤ 7d, Warning ≤ 30d, Never Renewed |
| Population | fully onboarded | all active drivers |

So the same word means a different set of drivers on each screen, and the numbers can never match.

## The fix

**1. Make dispatch chips clickable**
On Road / Home / Available / Down each navigate to Driver Hub with the matching status pre-applied in the "All Statuses" dropdown. Also align the wording with that dropdown so one status is never called two things:
- On Road → Dispatched
- Available → Not Dispatched
- Home → Home
- Down → Truck Down

Dot colors on the chips will use the same status tokens the Driver Hub badges use.

**2. One shared definition of the compliance tiers**
Overview stops computing its own thresholds and reuses the Driver Hub's tier logic (expired / critical ≤ 7d / warning ≤ configured window / never renewed), counted once per driver over the same active-driver population. The card numbers then equal the chip counts on the Driver Hub.

**3. Match labels and colors**
Card chips become Expired, Critical, Warning, Never Renewed with the same icons and the same destructive/warning tokens the Driver Hub chips use, so a red "Expired" chip means the same thing on both screens.

**4. Every chip lands pre-filtered**
Clicking any chip opens Driver Hub with exactly that chip already active (and the banner explaining the filter), instead of the generic list.

## Technical notes

- `src/pages/management/ManagementPortal.tsx`: replace the ad-hoc tier math in `fetchMetrics` with `getComplianceTierWithin` / `isNeverRenewed` from `DriverRoster`, keyed per operator rather than per document, over the same active-driver source the roster uses; add `driverDispatchFilter` state passed to `DriverHubView`; convert the dispatch chip `<span>`s to buttons that set it and switch view.
- `src/components/drivers/DriverHubView.tsx`: new `defaultDispatchFilter` prop forwarded to the roster.
- `src/components/drivers/DriverRoster.tsx`: accept an externally supplied status filter so the dropdown can be set from outside; filtering logic itself unchanged.
- The "Critical Expiries ≤ 30 days" card and the Alerts panel keep their current 30-day meaning (separate compliance concept) — only the Active Drivers chips are realigned.