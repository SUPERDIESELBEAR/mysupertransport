

## Add Flipbook View to Staff Inspection Binder Panel

### What's Built Now
- **Operator portal**: `OperatorInspectionBinder.tsx` has both List and Pages (flipbook) modes with cover page → company docs → driver docs → uploads.
- **Staff/Management portal**: `OperatorBinderPanel.tsx` (embedded in each driver's detail panel inside the Management/Staff Pipeline) only shows per-driver docs + driver uploads in list form. **No flipbook. No company docs. No cover page.**

### What I'll Add

Bring full flipbook parity to the staff-side panel so coordinators and management can preview the binder exactly as the driver sees it on their phone — including the cover page with USDOT/MC/driver name/unit number.

**1. `OperatorBinderPanel.tsx` changes**
- Fetch shared company-wide docs (same query the operator binder uses) in addition to per-driver docs and uploads — read-only, just for the flipbook.
- Fetch the driver's `unit_number` from `operators` to render on the cover page.
- Add a header action: **"Open Flipbook"** button (next to existing tab strip).
- Build the same `FlipbookPage[]` array as the operator binder — Cover → Company Docs → Driver Docs → Driver Uploads — respecting `useBinderOrder()` ordering.
- Mount `<BinderFlipbook>` (the existing component) with:
  - `driverName` = `operatorName`
  - `unitNumber` = fetched unit
  - `storageKey` = `flipbook:staff:${driverUserId}` (separate from operator's session memory so staff scrolling doesn't affect the driver)
  - `onClose` → close overlay

**2. No changes to**
- `BinderFlipbook.tsx` — already fully reusable.
- Operator-side binder.
- Database, RLS, storage. Staff already has `is_staff()` SELECT on `inspection_documents` and `driver_uploads`.
- Existing list view, upload, expiry, review actions in the staff panel — all preserved.

### Files Touched
| File | Change |
|---|---|
| `src/components/inspection/OperatorBinderPanel.tsx` | Add company-doc fetch, unit fetch, "Open Flipbook" button, flipbook mount |

### Open Question
Should the staff flipbook be **read-only** (preview only — no email/text/QR sharing actions in the ⋯ menu), or should it keep the same share actions the operator has so staff can email a doc to themselves or to inspectors on the driver's behalf?

My recommendation: **keep share actions enabled** — same component, same buttons. Staff already share docs from the list view, and disabling actions would mean forking the component. Let me know if you'd prefer read-only.

