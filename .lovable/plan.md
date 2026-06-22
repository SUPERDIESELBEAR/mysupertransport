## Goal

Apply the previously-built improvements (merged per-driver CDL + Med Cert, status highlighting, Cards view, search) to the correct section: the **Compliance Summary** panel (`InspectionComplianceSummary`) on the **Compliance tab**. Revert all changes to `ComplianceAlertsPanel` (which should never have been touched).

## Step 1 — Revert `ComplianceAlertsPanel.tsx`

Restore `src/components/inspection/ComplianceAlertsPanel.tsx` to its pre-change state: remove driver grouping, the List/Cards view toggle, the `compliance_alerts_view` localStorage key, the search bar, and the card grid. Keep the file exactly as it was before this task began (one row per operator+doc, existing filters/sort/bulk actions untouched).

## Step 2 — Update `InspectionComplianceSummary.tsx` (the real "Compliance Summary")

Add the requested capabilities to this component only:

**Per-driver grouping**
- Group the per-operator CDL and Medical Certificate rows into a single driver entry. Fleet-wide rows (Insurance, IFTA) stay as their own entries — they are not driver-scoped.
- Each driver entry exposes both certs as sub-items. Overall driver status = the worst of the two (`expired > critical > warning > missing > valid`).

**Highlight critical/expired**
- Driver entries with any expired or critical cert get a prominent red status stripe / border + pulsing dot. Warning gets gold. Valid stays neutral.
- Per-cert chips inside the entry keep their own status pill so staff see exactly which cert is the problem.

**View toggle (List ↔ Cards)**
- Add a List/Cards toggle in the panel header (next to the existing chevron). Default = Cards. Persist in `localStorage` under `compliance_summary_view`.
- **List view**: keep close to today's layout but collapsed to one row per driver — driver name, two cert chips (each with its own date + status pill), one action cluster on the right (Open in Inspection Binder). Fleet rows render as today.
- **Cards view**: responsive grid (`grid-cols-1 md:grid-cols-2 xl:grid-cols-3`), styled like the Dispatch Board cards. Each card shows: status stripe on the left, driver name header, two sub-rows (CDL, Med Cert) with badge + expiry date + days-until pill + "No date" tag when missing, and a footer "Open in Inspection Binder" link. Fleet entries render as a distinct card style (single doc, "Fleet-wide" label, inline date picker preserved).

**Search bar**
- Add a search input above the rows/grid. Case-insensitive filter on driver name. Fleet rows always remain visible (or hide them only when the query is non-empty — pick: hide when query non-empty, so search results stay focused on drivers).
- Search composes with existing status/doc-type filter chips.

**Preserve existing behavior**
- Keep all current data fetching, realtime subscriptions, fleet-row inline date picker, audit log + notification fan-out, filter chips, counts header, and footer summary. No backend / data-fetch changes.
- The doc-type filter chips for CDL and Med Cert still work — when active, only matching sub-rows render inside each driver entry (a driver with no matching cert is hidden).

## Step 3 — Verify

- Open `/dashboard?view=compliance`, expand Compliance Summary, confirm Cards is the default, toggle to List, run a search, and check that critical/expired drivers are visibly highlighted.
- Confirm Compliance Alerts (the panel above it) looks identical to before this task.

## Files

- `src/components/inspection/ComplianceAlertsPanel.tsx` — revert to pre-task state.
- `src/components/inspection/InspectionComplianceSummary.tsx` — add grouping, highlight, view toggle, search, Cards grid.

## Out of scope

Overview tab, data model, audit/notification logic, Document Hub `ComplianceDashboard`, `ComplianceAlertsPanel` behavior.
