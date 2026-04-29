## Goal

Right now, compliance "warning" alerts start showing as soon as a CDL or Medical Cert is within 90 days of expiry, which creates noise. We'll add a **staff-configurable visibility threshold** (30, 60, or 90 days) that controls when items first appear in the compliance UIs. Default will be **30 days**.

Backend cron emails (the automated 60-day and 30-day operator reminder emails in `check-cert-expiry`) are **not** changed — drivers still get their existing email cadence.

## What changes for users

A new "Show alerts within ___ days" selector appears in:

1. **Compliance Alerts panel** (Inspection menu) — header dropdown.
2. **Driver Hub** compliance chip row — same dropdown next to the chips.
3. **Inspection Compliance Summary** — the "Expiring within X days" tier label and filter respect the chosen window.

The selected value is shared across these surfaces (one setting, applied everywhere) and persists per staff user.

Behavior at each setting:

```text
Setting   Expired chip   Critical (≤7d)   Warning tier visibility
30 days   shown          shown            8–30 days only  ← default
60 days   shown          shown            8–60 days
90 days   shown          shown            8–90 days   (today's behavior)
```

"Expired" and "Critical (≤7d)" alerts are **always shown** regardless of setting — only the upper bound of the Warning tier moves.

## Technical details

### Storage
- Persist in `localStorage` under `compliance_alert_window_days` (values: `30 | 60 | 90`).
- Read via a new tiny hook `src/hooks/useComplianceWindow.ts` that returns `{ windowDays, setWindowDays }` and broadcasts changes through a `storage` event so all open surfaces stay in sync.
- No DB migration needed — this is a per-user UI preference, mirroring the `staff_sidebar_open` pattern already in the project.

### Files touched

- `src/hooks/useComplianceWindow.ts` *(new)* — hook + constant `DEFAULT_WINDOW = 30`.
- `src/components/shared/ComplianceWindowPicker.tsx` *(new)* — small `<Select>` rendering "30 / 60 / 90 days".
- `src/components/inspection/ComplianceAlertsPanel.tsx`
  - Replace hard-coded `if (days <= 90)` (line 143) with `if (days <= windowDays)`.
  - Mount `<ComplianceWindowPicker />` in the panel header.
- `src/components/drivers/DriverRoster.tsx`
  - `getTier()` (lines 60–67): keep `expired` and `critical` (≤7) unchanged; only return `'warning'` when `min <= windowDays`.
  - Filter logic (lines 588–595) and warning chip render (lines 755+) read from the hook.
  - Render `<ComplianceWindowPicker />` in the chip row.
- `src/components/drivers/DriverHubView.tsx`
  - Update the `'warning'` guidance banner copy (line 138) to use the dynamic value.
- `src/components/inspection/InspectionComplianceSummary.tsx`
  - `getStatus()` (lines 30–35): replace hard-coded `<= 90` with `<= windowDays`.
  - Update tier label "Expiring within 90 days" (line 287) and badge copy to use the dynamic value.

### Not changing

- `supabase/functions/check-cert-expiry/index.ts` — keeps its `[30, 60]` email cadence.
- `supabase/functions/check-inspection-expiry/index.ts` — its own internal `THRESHOLD` for fleet-doc reminders is independent and stays as-is.
- `send-cert-reminder` payload (`days_until`, `expiration_date`) is unchanged.
- DB schema, RLS, or migrations — none needed.

### Edge cases

- If a driver's doc is at, say, 45 days and the user lowers the window to 30, the row simply disappears from the Warning chip count and filter results; it reappears when the window goes back up. No data is mutated.
- The "Send reminders" bulk action in Driver Hub already only targets `expired` + `critical (≤7)`, so it is unaffected.

## Out of scope

- Per-doc-type thresholds (e.g. different windows for CDL vs Med Cert).
- Server-side enforcement / org-wide admin setting — this is a per-staff-user UI preference. Easy to upgrade later to a `staff_preferences` table if needed.
