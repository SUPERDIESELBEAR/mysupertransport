

## Add PE Screening Results Document Upload in Stage 1

### Problem
There's no way for staff to upload the PE Screening Results document in the pipeline. The QPassport uploader and PE Receipt (from operator) exist, but the actual results document from the screening provider needs a dedicated upload field.

### Change

**`src/pages/staff/OperatorDetailPanel.tsx`**

Add a new uploader component (modeled on the existing `QPassportUploader` pattern) just below the PE Screening Result dropdown (after line 3597). It will:

1. Accept PDF/image files (PDF, JPG, PNG) up to 10MB
2. Upload to `operator-documents` storage bucket under `{operatorId}/pe-results/`
3. Save the URL to `onboarding_status.pe_results_doc_url` (new column)
4. Show a "View Document" link when a file is already uploaded, plus a "Replace" option
5. Use the same styling as the existing QPassport uploader

**DB migration** — Add one nullable column to `onboarding_status`:
- `pe_results_doc_url text`

### Files Changed

| File | Change |
|------|--------|
| DB migration | Add `pe_results_doc_url` column to `onboarding_status` |
| `src/pages/staff/OperatorDetailPanel.tsx` | Add PE Results uploader below PE Screening Result select, fetch/display the URL from status |

