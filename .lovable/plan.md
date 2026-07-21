## Fleet Compliance — List View Restructure (Light Theme)

Rebuild the Fleet Compliance list view in `src/components/inspection/InspectionComplianceSummary.tsx` as a true table, matching the light palette and severity language already used by the restructured card view.

### Direction
Table + severity rail — one row per driver, one column per certification, with a sticky driver column and hover-revealed micro-actions.

### Visual system (light, matches card view)
- Background: white / off-white surface tokens (same as card view).
- Text: default foreground; muted-foreground for secondary meta.
- Gold accents for driver name and interactive affordances.
- Severity tokens reused from card view:
  - Critical: red-tinted background + left rail
  - Attention: amber-tinted background + left rail
  - Compliant: neutral surface, muted text
- No dark surfaces anywhere — dark mockup was reference only.

### Layout

```text
┌──────────────────────────┬─────────┬──────────┬─────────┬──────────────┬─────────┐
│ Driver / Overall status  │  CDL    │ Med Cert │  IRP    │ Registration │  2290   │
├──────────────────────────┼─────────┼──────────┼─────────┼──────────────┼─────────┤
│ ▍ J. Doe   [Critical]    │ 03/12/26│ 09/01/26 │ 12/31/25│  06/30/26    │ 08/31/26│
│                          │ TimePill│ TimePill │ TimePill│  TimePill    │ TimePill│
├──────────────────────────┼─────────┼──────────┼─────────┼──────────────┼─────────┤
│ ▍ E. Smith [Attention]   │ ...     │ ...      │ ...     │  ...         │ ...     │
└──────────────────────────┴─────────┴──────────┴─────────┴──────────────┴─────────┘
```

- Sticky left column: driver name + overall status tier badge (Critical / Attention / Compliant).
- Cert columns: expiration date + `TimePill` chip; whitespace-nowrap, no truncation.
- Row severity: left rail color + subtle tint reflecting the driver's worst cert status.
- Hover: reveal micro-actions per cell (view / upload) aligned right within the cell.
- Sort: driver name default; header click sorts by earliest expiry per column.

### Technical notes
- Only touch the list-view branch of `InspectionComplianceSummary.tsx`; card view stays as-is.
- Reuse existing helpers: `TimePill`, severity classifier, `PER_DRIVER_DOCS` (includes Registration + 2290).
- Use semantic tokens (`bg-background`, `bg-muted`, `border-border`, severity tokens) — no hardcoded colors.
- Preserve current data source and filters (status chips, search).
- Ensure horizontal scroll on narrow viewports with the driver column sticky.

### Out of scope
- Card view (already shipped).
- Fleet-wide summary cards above the list.
- Data model or compliance logic changes.
