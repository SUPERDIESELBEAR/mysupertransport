
## PE Screening — QPassport Upload (Staff) + Receipt Upload (Operator)

### What this feature does

**Staff side (Stage 1 — Background Check in OperatorDetailPanel):**
- When `pe_screening` is set to `scheduled`, a new "QPassport" upload button appears below the date picker. Staff upload the QPassport PDF directly to storage. The URL is saved on `onboarding_status.qpassport_url`.
- If a QPassport has already been uploaded, it shows as a small "View PDF" chip with a link. Staff can re-upload to replace it.

**Operator side (Stage 1 progress card + Documents tab):**
- When `pe_screening === 'scheduled'` AND `qpassport_url` is set, a "Download Your QPassport" card appears in the operator's Stage 1 background check section inside `OnboardingChecklist`. This is a link to open/download the PDF directly.
- A new "PE Screening Receipt" card appears in `OperatorDocumentUpload`. It only surfaces when `pe_screening === 'scheduled'` or `pe_screening === 'results_in'`. The operator can take a photo or upload a file (image or PDF). Accepts `.pdf,.jpg,.jpeg,.png,.heic`.
- On successful upload, the system triggers the `send-notification` edge function with a new `pe_receipt_uploaded` type, sending an in-app notification (and email if enabled) to the assigned staff coordinator and management users.

---

### Schema Changes (1 migration)

```sql
-- Add two URL columns to onboarding_status
ALTER TABLE public.onboarding_status
  ADD COLUMN IF NOT EXISTS qpassport_url TEXT,
  ADD COLUMN IF NOT EXISTS pe_receipt_url TEXT;

-- Add pe_receipt to operator_doc_type enum
ALTER TYPE public.operator_doc_type ADD VALUE IF NOT EXISTS 'pe_receipt';
```

No new tables needed. The QPassport URL lives on `onboarding_status` (staff-managed, not operator-uploaded). The PE receipt is stored as an `operator_documents` row with `document_type = 'pe_receipt'`, consistent with how `insurance_cert` and `truck_inspection` are handled.

---

### Files to Change

**1. `supabase/migrations/[timestamp].sql`**
Add `qpassport_url TEXT` and `pe_receipt_url TEXT` to `onboarding_status`, and `pe_receipt` to `operator_doc_type` enum.

**2. `src/pages/staff/OperatorDetailPanel.tsx`**
- Add `qpassport_url: string | null` and `pe_receipt_url: string | null` to the `OnboardingStatus` type.
- In Stage 1's PE Screening section (lines ~3090–3106), add a file upload control below the PE Scheduled Date picker that only renders when `pe_screening === 'scheduled' || pe_screening === 'results_in'`. Staff upload goes to `operator-documents` bucket at `{operatorId}/qpassport/{timestamp}.pdf`, then `onboarding_status.qpassport_url` is updated.
- Show a "View QPassport" chip link when `qpassport_url` is set.
- Add a `pe_receipt_url` read-only display row below PE Results — if set, show a "View Receipt" link that the operator uploaded.

**3. `src/components/operator/OperatorDocumentUpload.tsx`**
- Add a conditional "PE Screening Receipt" document slot. It renders only when `onboardingStatus.pe_screening === 'scheduled' || onboardingStatus.pe_screening === 'results_in'`.
- Uses the same upload pattern as other slots: uploads to `operator-documents` bucket, inserts an `operator_documents` row with `document_type = 'pe_receipt'`.
- On success, calls the `send-notification` edge function with `type: 'pe_receipt_uploaded'`.

**4. `src/components/operator/OnboardingChecklist.tsx`**
- In Stage 1's rendered substeps section, add a conditional "Download Your QPassport" action card. Renders when `onboardingStatus.pe_screening === 'scheduled'` AND `onboardingStatus.qpassport_url` is set. Styled as a gold action card with a download icon link.

**5. `supabase/functions/send-notification/index.ts`**
- Add a new `case 'pe_receipt_uploaded'` in the switch. It notifies the assigned staff + management users (same pattern as `onboarding_milestone`) with:
  - In-app: "📄 PE Receipt Uploaded — [Name]"
  - Email: "Operator has uploaded their PE screening receipt. Log in to review."

---

### Data Flow

```text
Staff schedules PE screening
  └─> pe_screening = 'scheduled'
  └─> Staff uploads QPassport PDF → onboarding_status.qpassport_url

Operator logs into portal
  └─> Stage 1 shows "Download Your QPassport" card (links to PDF)
  └─> Documents tab shows "PE Screening Receipt" upload slot

Operator uploads receipt
  └─> operator_documents row inserted (document_type='pe_receipt')
  └─> send-notification(pe_receipt_uploaded) fires
       ├─> In-app notification → assigned staff + management
       └─> Email → assigned staff + management (pref-gated)

Staff reviews in OperatorDetailPanel Stage 1
  └─> "View Receipt" link appears below PE Results
```

---

### Technical Details

- **QPassport storage path:** `{operatorId}/qpassport/{timestamp}.pdf` in `operator-documents` bucket (already has correct staff RLS)
- **Receipt storage path:** `{operatorId}/pe_receipt/{timestamp}.{ext}` in `operator-documents` bucket (operator INSERT is already allowed)
- **Notification event type:** `'pe_receipt_uploaded'` — added to the `send-notification` edge function
- **No new edge function** needed — piggybacking on `send-notification`
- **No new storage bucket** — `operator-documents` bucket already handles both staff and operator uploads
- The QPassport download link will be a signed URL (1-year expiry) stored at `qpassport_url`, same as other document URLs in the app
- The `pe_receipt_url` display on the staff side reads from `operator_documents` table (most recent `pe_receipt` row), not a separate column — consistent with how `form_2290`, `truck_inspection`, etc. are shown in the `docFiles` state
