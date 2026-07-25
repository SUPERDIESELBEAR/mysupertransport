## Fix: OSAS Assignment Sheet "View" opens a real preview

**Problem**
On Onboard Systems → Assignment Sheets, clicking **View** shows a toast placeholder ("Full preview coming in next phase.") instead of the sheet.

**Fix**
Replace the toast with a real preview modal that renders the sheet contents already in memory — no new data fetches needed.

### Changes

1. **New `src/components/equipment/SignOffSheetPreviewModal.tsx`**
   - Dialog (reuses shadcn `Dialog`) sized for desktop + mobile.
   - Header: driver name, unit number, status badge, assignment date.
   - Body:
     - Driver contact (email, phone)
     - Devices table: type label (ELD / Dash Cam / BestPass) + serial
     - BestPass fee row ($60.00) when `bestpass_included`
     - Standard unreturned-equipment notice ($1,000 ELD replacement) — same copy as the email template for consistency
     - Signature block: if `signed_at` present, show signed timestamp and embedded signature image (from `signature_url` if the column exists on the row; otherwise just the timestamp)
   - Footer actions: **Close**, **Resend** (only when status is `draft` or `sent`, wired to the same `send-osas-to-operator` invoke used in the list), **Copy sign link** (builds `/dashboard?view=onboard-systems&osas_token=<access_token>` from `window.location.origin`).

2. **`src/components/equipment/EquipmentInventory.tsx`**
   - Add `previewSheet` state.
   - `onPreview={sheet => setPreviewSheet(sheet)}` instead of the toast.
   - Render `<SignOffSheetPreviewModal sheet={previewSheet} onClose={() => setPreviewSheet(null)} onResent={...} />`.
   - On successful resend from the modal, refresh the list (reuse existing `SignOffSheetList` refresh — trigger via a small `refreshKey` state bumped on close, or expose a ref; simplest: bump a `listRefreshKey` passed as `key` to `<SignOffSheetList/>`).

### Out of scope
- No schema changes.
- No changes to the driver-facing signing page.
- No PDF export (can be a follow-up if desired).

### Technical notes
- Preview reads from the `SheetWithItems` object already loaded by `SignOffSheetList` — no extra query, so it works for `draft`, `sent`, and `signed` alike.
- Type import: reuse the existing `SheetWithItems` type by exporting it from `SignOffSheetList.tsx`.
