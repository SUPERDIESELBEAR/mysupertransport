## Technical notes

- New `src/components/pei/PEIProgressStrip.tsx`: props `applicationId`,
  `onOpenPEI?`. Reads live requests with the existing
  `fetchPEIRequestsByApplication` (already filters withdrawn rows) and buckets
  status with the existing `summarizePEIRows` shape from
  `src/components/staff/PEIStatusPill.tsx` — no new query, no new API.
- Rendered in `src/components/management/ApplicationReviewDrawer.tsx` between
  the header (line ~874) and the tab row, and reused inside
  `src/components/management/PEIQuickDrawer.tsx` header area.
- The PEI tab button gains the `completed/total` badge from the same hook data;
  lift the fetch into a tiny `usePEIProgress(applicationId)` hook so strip and
  badge share one read.
- Colours via existing tokens (`bg-muted`, `warning`, `status-complete`) —
  no hardcoded colour utilities.
- Clicking the strip calls `setActiveTab('pei')`.
- Presentation only: no migration, no RLS, no writer changes.
