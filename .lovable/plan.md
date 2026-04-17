

## Add Flipbook to Inspection Binder (Staff/Management view)

### Where it goes
Inside `InspectionBinderAdmin.tsx` — the component mounted by both **Staff Portal → Inspection Binder** and **Management Portal → Inspection Binder**. A "View as Flipbook" button appears in the header **only when a driver is selected** (matches the user's request).

### How it'll look
```text
┌─ Inspection Binder ─────────────────────────────────────┐
│  Driver: [ Salman Mohamed ▾ ]   [📖 View as Flipbook]  │  ← new button
│                                                         │
│  [ Company ] [ Driver ] [ Uploads ] [ Staging ]         │
│  ...existing tabs...                                    │
└─────────────────────────────────────────────────────────┘
```
- Button is **disabled / hidden** until a driver is selected (Flipbook is per-driver)
- Click opens the existing full-screen `BinderFlipbook` overlay
- Pages built from the same data the admin already loads: cover → company docs (in saved order) → per-driver docs (in saved order) → driver uploads
- Reuses every existing capability of the Flipbook: swipe, keyboard nav, share via email/SMS/QR, multi-select share

### Files to change

| File | Change |
|---|---|
| `src/components/inspection/InspectionBinderAdmin.tsx` | • Import `BinderFlipbook` + `FlipbookPage`<br>• Add `flipbookOpen` state<br>• Add "View as Flipbook" button next to the driver selector (visible only when `selectedDriverId` is set)<br>• Render `<BinderFlipbook>` at bottom — build pages from existing `companyDocs`, `perDriverDocs`, `driverUploads`, `companyOrder`, `driverOrder` (same recipe used in `OperatorInspectionBinder.tsx` lines 421-469)<br>• Resolve driver name + unit number for the cover (look up `operators` row → `applications.first/last_name` + `onboarding_status.unit_number`) |

### Why this is safe
- Zero changes to `BinderFlipbook` itself — the component is already proven (used by operator portal + operator drill-down panel)
- Zero DB changes
- Zero impact when no driver is selected — button stays hidden
- Read-only feature — no writes, no permissions changes

### Out of scope
- Adding a Flipbook button to the **company-wide tab** when no driver is picked (Flipbook is inherently per-driver — the cover page needs a driver name + unit)
- Re-ordering pages (already handled via the existing binder-order admin UI)

