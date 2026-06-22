## Goal

Move the work to the right place — the **Compliance** tab (sidebar item, `view === 'compliance'`), specifically the **Compliance Alerts** panel rendered by `ComplianceAlertsPanel`. That's the place currently showing CDL and Med Cert as two separate rows per driver.

Also revert the per-driver merge / list+cards / search additions made earlier to the Overview tab's "Compliance Summary" preview block back to its original simple list, since the user didn't want them there.

## Scope

- `src/components/inspection/ComplianceAlertsPanel.tsx` — primary change.
- `src/pages/management/ManagementPortal.tsx` — revert Overview block; drop the now-unused `ComplianceSummaryCard` import and the per-driver shape on `complianceSummary`.
- `src/components/management/ComplianceSummaryCard.tsx` — delete (no longer used).
- No DB / edge / data-fetch changes.

## Changes in the Compliance tab (`ComplianceAlertsPanel`)

### 1. Per-driver grouping
Group the existing `alerts: ComplianceAlert[]` by `operator_id` into:

```text
DriverGroup {
  operator_id, operator_name,
  cdl?: ComplianceAlert,
  med?: ComplianceAlert,
  worstDays  // min of present alerts; drives sort + status color
}
```

- All existing fetch logic, reminder/renewal state, filters (`docFilter`, `noActionOnly`), sort modes, and bulk-action handlers stay intact — they keep operating on the underlying `alerts` array keyed by `${operator_id}|${doc_type}`.
- The `docFilter` chips still apply: when set to `CDL` or `Medical Cert`, a driver only appears if their matching cert is in the window; the other slot is hidden in that view.

### 2. View toggle (List ↔ Cards)
Add a segmented control in the existing right-side action cluster, ahead of `ComplianceWindowPicker`:

```text
[ ▤ List ] [ ▦ Cards ]
```

Persisted in `localStorage` under `compliance_alerts_view`. Default: **Cards** (matches the user's stated preference for the Dispatch-Board-style format with all info migrated).

### 3. List view (combined per driver)
Replace the current per-cert row with one row per driver:
- Single urgency dot driven by `worstDays`.
- Driver name + a stack of cert chips (CDL / Med Cert) each with its own expiry date, "Xd left / Expired" pill, and the existing per-row action cluster (Send Reminder, Mark Renewed, Last Reminded, Last Renewed) rendered as a compact sub-row per cert.
- Sort/headers preserved; the "Last Action" sort uses the most recent of the driver's two certs.

### 4. Card view (Dispatch-Board-style, all info migrated)
Responsive grid (`grid-cols-1 md:grid-cols-2 xl:grid-cols-3`). Each card per driver shows:
- Left status stripe (red for expired/critical, gold for warning).
- Header: driver name + an overall status badge (Expired / Critical / Warning).
- One section per present cert (CDL, Med Cert) with:
  - Cert label, expiry date, days-left pill.
  - "Never Renewed" tag when applicable.
  - "Last Reminded" and "Last Renewed" mini-pills (same freshness colors as today).
  - Per-cert action buttons: **Send Reminder** and **Mark Renewed** (reusing `handleSendReminder` and the row renewal handler).
- Footer: small "Open operator" link calling `onOpenOperator(operator_id)`.

### 5. Search bar
New input in the header action cluster (visible in both views). Case-insensitive substring filter on driver name. Stacks with `docFilter` and `noActionOnly`. Empty query keeps current behavior.

### 6. Highlight critical / expired
- Status tiers: expired (`< 0`) and critical (`0–30`) use `destructive`; warning (`31–windowDays`) uses `gold/yellow`.
- Expired drivers get a pulsing dot (already exists) and float to the top via `worstDays` sort.

## Revert in Overview tab (`ManagementPortal.tsx`)

- Restore the original inline Compliance Summary JSX (one row per CDL/Med Cert expiry, top 5).
- Restore the original `ComplianceRow` type and `rows.push(...)` builder; revert `setComplianceSummary(rows.slice(0, 5))`.
- Remove `import ComplianceSummaryCard` and delete the component file.

## Out of scope

- `InspectionComplianceSummary` (separate fleet-doc summary below the alerts panel) — unchanged.
- Data-fetching logic, bulk action handlers, cooldowns, audit/reminder tables — unchanged.
- The Document Hub `ComplianceDashboard` — unchanged.

## Verification

- Overview tab Compliance Summary looks exactly as before (one row per cert, top 5, no toggle, no search).
- Compliance tab: a driver with both CDL and Med Cert expiring shows as one entry (one card / one row), not two.
- Cards view is default on first visit; switching to List persists across refresh.
- Search filters both views by name; clearing restores; combines correctly with the CDL/Medical Cert/No Action chips.
- Per-cert Send Reminder and Mark Renewed still work, update state, and respect cooldowns.
- Bulk "Send Reminders to All", "Mark All Renewed", "Remind Uncontacted" still target the same underlying alerts and counts.
