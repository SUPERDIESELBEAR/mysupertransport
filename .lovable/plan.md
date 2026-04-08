
I confirmed the files do exist in the backend.

Findings:
- There are 26 submitted applications that already have CDL and medical certificate uploads saved.
- All 26 have all three document fields populated:
  - `dl_front_url`
  - `dl_rear_url`
  - `medical_cert_url`
- The newest submission with docs was today, so this is not a missing-data problem.

Most likely cause:
- The uploads are being stored correctly as raw storage paths like `applications/...jpg`.
- The working `ApplicationReviewDrawer` already handles these raw paths correctly by resolving them before generating signed preview URLs.
- The `OperatorDetailPanel` “Uploaded Documents” section is using different path-handling logic, so it is likely failing to generate the signed URLs for these applicant files consistently.

Plan:
1. Update `src/pages/staff/OperatorDetailPanel.tsx` to use the same storage-path resolution approach that already works in `src/components/management/ApplicationReviewDrawer.tsx`.
2. Replace the current ad hoc CDL/medical preview path parsing with a shared helper that supports:
   - raw storage paths
   - legacy full storage URLs
3. Use the resolved path to generate fresh signed URLs for:
   - CDL front
   - CDL rear
   - medical certificate
4. Keep the existing in-app preview modal, but make the failure case clearer if a signed URL cannot be generated.
5. Verify the fix by checking that applicant documents open from both:
   - the staff/operator detail panel
   - the application review drawer

Technical detail:
- This looks like a view-layer path parsing mismatch, not an RLS/data issue.
- The database values are present; the bug is in how the staff panel turns those values into previewable signed URLs.
