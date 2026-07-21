
# Fleet Compliance — Restructure (Design-First)

Goal: make the Fleet Compliance page (`src/components/inspection/InspectionComplianceSummary.tsx`) fast to scan and easy to act on, in both **card view** and **list view**, without removing any existing data or actions.

## Phase 1 — Pick the visual direction (this turn, no code)

1. Capture the current cards view of Fleet Compliance from the running preview so the design tool has a real reference (not prose).
2. Generate **3 rendered card-view directions** using that screenshot. Same locked content in all three: driver name, unit, overall status pill, CDL, Med Cert, IRP (cab card), Registration, 2290, expiry date, days-until-expiry, stale marker, updated-by note, per-row upload/history/reminder actions, Open in Binder link, Timeline link. They differ only in composition/density/hierarchy. Working themes:
   - **Traffic-light rail** — status-colored left border on the card; one-line-per-cert rows; header shows the single worst cert as a summary line.
   - **Status-first grid** — cert badges arranged as a compact 2-column mini-grid inside each card; expired/critical items promoted to the top of the grid regardless of cert type.
   - **Timeline strip** — a small horizontal timeline across the top of each card places all 5 certs by expiry proximity; details listed below.
3. Present the three previews via the prototype picker. One question: "Which direction should I build?"

No files change in Phase 1.

## Phase 2 — Build the chosen direction (separate approval)

After you pick a direction, I implement it in three passes:

### Pass A — Shared primitives
- `<TimePill>` — unified grammar: past = "21d ago" (destructive), ≤30d future = "22d left" (warning), >30d future = "3y 20d" (muted), missing = ghost "Set date" button that triggers upload.
- `<StaleGlyph>` — small ⚠ with tooltip, replacing the standalone "Stale" pill next to expiry pills.
- `<ComplianceStatusChips>` — filter strip at the top of the page: Expired · Due ≤window · Stale · No date · Current, each with counts. Clicking filters the current view. Persists across card ↔ list toggle.
- Default sort switches from A→Z to **Needs attention** (Expired → Due soon → Stale → No date → Current); A→Z remains an option.

### Pass B — Card view
- Refactor the per-driver card into `ComplianceDriverCard` matching the chosen direction.
- Header: driver name, unit, overall status pill, one-line "worst cert" summary.
- Body: one row per cert per the chosen layout; "no date" rows render at reduced opacity so urgent items stand out.
- Actions consolidated into a right-aligned icon cluster (Upload / History / Reminder) with tooltips; kebab holds View file / Copy link.
- Footer keeps "Updated by … · Nd ago", Open in Binder, Timeline.
- Density toggle (Comfortable / Compact) stored under the existing `compliance_summary_view` key family.

### Pass C — List view
- Convert the current per-driver stack into a real table (`ComplianceTable`):
  - Columns: Driver · Unit · Status · CDL · Med Cert · IRP · Reg. · 2290 · Updated · ⋯
  - Each cert cell shows date (top) + `<TimePill>` (bottom); cell tint reflects urgency.
  - Sticky driver column + sticky header; horizontal scroll on narrow viewports.
  - Sortable cert columns (soonest first).
  - Chevron row expander reveals uploaded_by, file preview, reminder controls, history log — nothing is removed, just tucked.
  - Row action menu (⋯) holds Open in Binder, Timeline, Upload, Send reminder.
  - Optional bulk-action checkbox column for "Send reminder" / "Mark reviewed" across selection.

## Data / scope guardrails

- No changes to `v_compliance_items`, `PER_DRIVER_DOCS`, upload flows, or sync triggers.
- No mobile-app changes (driver-facing app untouched).
- Every field currently visible remains reachable, either directly on the row or via the expander/kebab.
- Reuses `useComplianceWindow` for the "Due ≤N days" chip so it respects the staff-user's chosen window.

## Deliverable of this turn

Just Phase 1: three rendered card previews for you to compare, then a single pick. No code edits happen until you approve the chosen direction.
