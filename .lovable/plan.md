## Goal
Surface the **Payroll Deposit Overview** and **Payroll Calendar** PDFs in the Operator Resource Library so drivers can view/download them outside of Stage 8 (Pay Setup) at any time.

## Where they live today
- Files: `operator-documents` bucket (private), at `company-docs/payroll-deposit-overview.pdf` and `company-docs/payroll-calendar.pdf`.
- Only surfaced inside `ContractorPaySetup.tsx` via signed URLs.

## Approach
Add a new **Payroll** category to the existing Resource Library (already used by `OperatorResourceLibrary` for User Manuals, Decal Files, Forms & Compliance, DOT General). The two PDFs become first‑class library entries — searchable, viewable, downloadable, and shareable — and stay in sync with the same source files used in Stage 8.

### Steps

1. **DB migration**
   - Add `'payroll'` value to the `resource_category` enum.
   - Insert two rows into `resource_documents`:
     - "Payroll Deposit Overview" — category `payroll`, sort_order 0
     - "Payroll Calendar" — category `payroll`, sort_order 1
   - `file_url` will point to `resource-library` bucket (public) — see step 2.

2. **Storage**
   - Copy the two PDFs from `operator-documents/company-docs/*.pdf` into the public `resource-library` bucket (one‑time copy via a small script in the migration using `storage.objects` insert from existing object). If direct copy isn't viable, we re-upload via an edge function task or have the existing PDFs in `public/payroll-calendar.pdf` (already in repo) seeded — we'll use the canonical files from `operator-documents`.

3. **UI**
   - Update `CATEGORY_LABELS` in `src/components/operator/OperatorResourcesAndFAQ.tsx` and `RESOURCE_CATEGORIES` in `src/components/management/ResourceLibraryManager.tsx` to include:
     - `payroll: '💰 Payroll'`
   - No other component changes needed — the library already renders any category dynamically.

4. **Keep Stage 8 unchanged**
   - `ContractorPaySetup.tsx` continues to read from `operator-documents/company-docs/*` (preserves acknowledgement flow + signed URLs).
   - Library entries are independent reference copies; staff can manage/replace them via the existing Resource Library Manager in Management Portal.

## Result
Drivers will see a new **💰 Payroll** section in their Resource Library (Operator Portal → Resources tab) containing both PDFs with View / Download / Share actions, accessible at any time before, during, or after onboarding.
