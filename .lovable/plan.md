# Load Detail Page — Pass 1

Replace the placeholder at `/dispatch/loads/:id` (and the Management `load-detail` view) with a real, read-only Load Detail page. Routing and both portal entry points stay exactly as they are.

## Page layout

**Sticky header** — load number (large, mono), status badge, load-type chip for Per-Ton Bulk / Trailer Relocation, "Back to Loads" (uses `onBack` when supplied, otherwise navigates to `/dispatch/loads`), and an "Edit Load" button that only fires a "Load editing coming soon" toast.

**Hold banner** — if an active claim flag has level `hold`, a destructive banner under the header states the load is on hold and excluded from settlement, with the claim description. Rendered only for management, owner, dispatcher and onboarding_staff.

**Section 1 — Load Summary**: broker company + MC number ("No broker" on loadout loads), broker reference number, driver name or "Unassigned", dispatcher name or "Unassigned", equipment and handling type, commodity, weight with thousands separators, BOL and PO when present, created date and created-by name.

**Section 2 — Rate Details**: layout adapts to rate type — flat (linehaul), per mile (rate + computed total), per ton (rate, estimated tons, confirmed tons or "Awaiting scale ticket", computed total), percentage of load (linehaul plus explanatory note). Loadout loads show relocation fee and trailer use period instead. Always shown: fuel surcharge ("Bundled into linehaul" or the amount), loaded / deadhead / total miles, total load value, and revenue per mile when both value and loaded miles exist.

**Section 3 — Conditional blocks**: Reefer Requirements (reefer equipment), Trailer Relocation Details (loadout), and Flags (team load with co-driver, hazmat, permit required with cost and recovery method) — each rendered only when applicable.

**Section 4 — Stops Timeline**: vertical timeline in `stop_sequence` order. Each stop shows sequence number, stop-type badge, facility name with a saved-facility indicator when `facility_id` is set, multi-line address, contact name and formatted phone, appointment window, actual arrival/departure or "Not yet arrived" / "Not yet departed", dwell time when both are recorded, stop notes, and a stop-off charge indicator. Completed stops are visually distinct from upcoming ones.

**Section 5 — Notes**: Internal Notes (staff-only badge, hidden from operators), Driver-Facing Notes, and Special Instructions — each block only when it has content.

Loading shows a skeleton; a missing load or an access denial shows a clear not-found state with a link back to the Loads list.

## Technical notes

- `src/pages/dispatch/LoadDetailPage.tsx` replaces `LoadDetailPlaceholderPage.tsx`; imports in `DispatchPortal.tsx` and `ManagementPortal.tsx` are updated to the new file. Props (`loadId`, `onBack`) keep the same shape.
- One React Query fetch of `loads` with embedded `brokers:broker_id(...)`, `dispatcher:dispatcher_id(first_name,last_name)`, `load_stops(*)`, plus a second query for `claim_flags` filtered to active flags (staff only, so operator requests never ask for them). Driver and created-by names resolve through `fetchProfileNames` / the operators lookup, matching the pattern already used in `LoadsListPage`.
- Presentation split into small components under `src/components/dispatch/loadDetail/` (summary, rate, conditional blocks, stops timeline, notes) so pass 2 can add action controls around them.
- Reuses `LoadStatusBadge`, `formatEnumLabel` / `formatCurrency` / `formatShortDate` from `loadFormat.ts`, `formatPhone` from `textNormalize.ts`, and label maps plus `calcTotalLoadValue` from `loadRateMath.ts`. Only shadcn components already in the project; semantic charcoal/gold tokens, no hardcoded colors.
- Role gating uses `useAuth` (`isStaff` / `isOperator`) purely for display; RLS remains the enforcement layer.
- No database changes, no changes to the Loads list or Create Load form.

## Verification

Load a staff-visible load in the running app and confirm each section renders, then confirm an operator view shows no claim-flag banner and no internal notes.
