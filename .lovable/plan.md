## Goal
Let any authenticated operator view the two Stage 8 reference PDFs (Payroll Deposit Overview, Payroll Calendar) so they can preview them and toggle the acknowledgment switches.

## Root cause (recap)
- Files live at `operator-documents/company-docs/payroll-deposit-overview.pdf` and `.../payroll-calendar.pdf`.
- The `operator-documents` bucket is private.
- Existing SELECT policies on `storage.objects` only allow operators to read paths whose first folder segment is their own `operator_id` or `pay-setup`. There is no policy covering `company-docs/`, so `createSignedUrl` returns null for operator accounts (staff bypass via the `is_staff` policy, which is why this slipped past in staff testing).

## Fix — Option A: add a SELECT RLS policy

Migration:

```sql
CREATE POLICY "Authenticated can view company-docs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'operator-documents'
  AND (storage.foldername(name))[1] = 'company-docs'
);
```

Scope is narrow:
- Bucket-scoped to `operator-documents`.
- Restricted to objects under the `company-docs/` folder only.
- Read-only (SELECT).
- Authenticated users only — not anonymous.

These PDFs are general policy/reference documents identical for every driver and are also already linked publicly elsewhere in the project (e.g. `/public/payroll-calendar.pdf`), so no sensitive data is exposed.

## Verification after migration
1. Log in as Marcus (operator), open Stage 8 → Pay Setup.
2. Click each "View" button → the PDF opens in `FilePreviewModal`.
3. Toggle each acknowledgment switch → state persists.
4. Submit Pay Setup → row written to `contractor_pay_setup` with `deposit_overview_acknowledged_at` and `payroll_calendar_acknowledged_at` timestamps.
5. Confirm staff/owner reads still work (covered by existing `Staff can manage all operator documents` policy).

## No code changes required
`ContractorPaySetup.tsx` already correctly fetches signed URLs and writes per-doc acknowledgment timestamps; only the storage RLS gap needs patching.
