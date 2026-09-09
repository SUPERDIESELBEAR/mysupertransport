## Technical details

### Driver side

- `src/components/inspection/OperatorInspectionBinder.tsx`: add an **Upload new version** action on the per-driver slots for CDL, Medical Certificate, IRP Registration, and Form 2290 only. The upload dialog requires a file **and** a new expiry date (date picker, must be a future date).
- Upload writes to the existing `driver_uploads` flow extended with a binder link, or a new pending table — decided by the smaller diff; preference is reusing `driver_uploads` with a new `driver_upload_category` value set (additive enum values: `binder_cdl`, `binder_medical`, `binder_irp`, `binder_2290`) plus nullable `binder_document_id` (FK to `inspection_documents`) and `proposed_expires_at` columns. The driver sees their submission as Pending Review in the same list they already know.

### Staff side

- Pending driver replacements surface in `src/components/inspection/ComplianceAlertsPanel.tsx` (Fleet Compliance) as a review item on the driver's row, and in the existing driver-uploads review list — one queue, two doors.
- **Approve**: one action updates the `inspection_documents` row (file_path, file_url, expires_at, uploaded_at/by). The archive trigger from the staged draft files the outgoing version automatically. The driver gets an in-app notification; the compliance alert clears via the live view.
- **Reject**: sets `needs_attention` with a staff note; the driver sees the reason on their binder slot and can re-upload.

### Compliance auto-refresh verification

- `v_compliance_items` already reads `inspection_documents` live; `InspectionComplianceSummary.tsx` already subscribes to realtime changes. The verification pass walks every writer of `file_path` / `file_url` / `expires_at` on `inspection_documents` (binder admin replace, Vehicle Hub DOT sync, onboarding sync, driver approval path) and confirms each writes file and expiry together. Any writer that sets one without the other is fixed.

### Migration (staged, applies on draft accept)

- Additive enum values on `driver_upload_category`; nullable `binder_document_id` and `proposed_expires_at` columns on `driver_uploads`. No RLS changes expected — existing driver_uploads policies cover it; confirm during build.

### Verification

- Driver uploads a renewed Medical Certificate → staff approve → binder shows the new file, old file under History, expiry alert cleared in Fleet Compliance without a manual refresh.
- Reject path: binder untouched, driver sees the note.
- Typecheck plus the binder and compliance test suites.
