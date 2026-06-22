## Goal

In the SUPERDRIVE management dashboard, the **Compliance Summary** card currently lists one row per (driver × document), so a driver with both a CDL and a Med Cert nearing expiry shows up twice. Combine them into a single per-driver entry, add stronger visual emphasis for expired/critical status, and add a card view (Dispatch Board style) with a search bar.

## Scope

- File: `src/pages/management/ManagementPortal.tsx` — the Compliance Summary block (~line 1209) and its data builder (~line 343, `complianceSummary`).
- New small component: `src/components/management/ComplianceSummaryCard.tsx` (extracted to keep the portal file manageable).
- No DB/edge changes. No changes to `ComplianceAlertsPanel`, `InspectionComplianceSummary`, or `ComplianceDashboard`.

## Changes

### 1. Per-driver data shape
Replace `ComplianceRow` (one per doc) with a per-driver row that holds both certs:

```text
{
  operatorId, name,
  cdl:  { expiryDate, daysUntil } | null,
  med:  { expiryDate, daysUntil } | null,
  worstDays  // min(cdl.daysUntil, med.daysUntil) used for sort + status color
}
```

Build by grouping during the existing `operators` loop. Keep the existing `<=90 days` inclusion rule (drivers with at least one cert within 90 days appear). Sort by `worstDays` ascending. Keep `slice(0, 5)` for the list view and expose the full filtered list for the card view.

### 2. Status tiers (highlight critical/expired)
Per driver, derived from `worstDays`:
- **Expired** (`< 0`) — red ring/badge, `bg-destructive/10`, "Expired Xd ago" pill.
- **Critical** (`0–30`) — red badge, "Xd left".
- **Warning** (`31–90`) — gold badge.

Each cert chip inside the row carries its own pill (CDL · 12d, Med Cert · 47d) so staff can see which doc is driving the status.

### 3. View toggle: List ↔ Cards
Add a small segmented control in the card header (next to "View all"):

```text
[ ▤ List ] [ ▦ Cards ]
```

- **List view** — current compact rows, but merged per driver (one row, two cert pills).
- **Card view** — Dispatch-Board-style tiles in a responsive grid (`grid-cols-1 sm:grid-cols-2 xl:grid-cols-3`). Each card shows: driver name, an overall status stripe (red/gold), two cert rows (CDL + Med Cert) each with date and days-left pill, and an "Open" action to the operator detail.

Default view: **List** (preserves current behavior). Persist the user's choice in `localStorage` under `mgmt_compliance_summary_view`.

### 4. Search bar
Visible in both views; filters by driver name (case-insensitive substring). Empty query = current behavior (top 5 in list, all up to 90 days in cards). When the user is searching, show all matches (not capped at 5) so a search isn't silently truncated.

### 5. Layout
Header row becomes:

```text
[icon] Compliance Summary                 [search] [List|Cards] [View all →]
       Operators with nearest document expiries
```

On mobile the controls wrap below the title.

## Out of scope

- Counts in the stat tiles above (`expired`, `critical`, `noReminder`) — unchanged.
- The separate Inspection Compliance Summary, Compliance Alerts panel, and Document Hub compliance dashboard.
- Reminder send actions inside the summary (still launched from the operator detail / alerts panel).

## Verification

- Driver with both certs ≤ 90 days appears once, both pills visible.
- Driver with only one expiring cert appears once with a single pill.
- Expired drivers sort to the top with red emphasis.
- Toggling List/Cards updates the layout and persists across refresh.
- Typing a name filters both views; clearing restores defaults.
- "Open" still routes to the operator detail correctly.
