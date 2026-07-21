## Fleet Compliance — Sticky Header Row (List View)

### Problem
In the restructured list view, the column header row (Driver / Status, CDL, Med Cert, IRP, Registration, 2290) scrolls out of view along with the page. Once scrolled, users lose the context of what each column represents.

### Fix
Make the list view's column header row **sticky** so it remains visible at the top of the viewport while the driver rows scroll beneath it.

### Scope
Only `src/components/inspection/InspectionComplianceSummary.tsx` — list view branch only. Card view and data logic untouched.

### Technical notes
- Add `sticky top-0 z-20` (plus a solid `bg-background` and subtle bottom border) to the header row so it doesn't blend with rows scrolling underneath.
- The driver column already uses `sticky left-0`; the header's driver cell needs `sticky left-0 z-30` so the corner cell stays pinned both vertically and horizontally during combined scrolls.
- Verify the sticky offset accounts for the page's outer scroll container. If the table scrolls with the page (not an inner scroller), `top-0` pins to viewport; if there's a parent header bar we need to offset by its height — confirm by inspecting the parent layout before finalizing the offset value.
- Preserve existing severity rails, hover micro-actions, filters, and sort behavior.

### Out of scope
- Card view
- Fleet-wide summary cards
- Column set, sort logic, data source
