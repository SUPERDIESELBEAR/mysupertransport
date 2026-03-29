

## Fix Disclosure Document PDF Downloads

### Problems Identified

1. **No signatures on any document** — Signature images are in a private storage bucket. Browser print can't load authenticated URLs. All 4 docs affected.
2. **DOT Drug & Alcohol answers show blank radio buttons** — The `AnswerRow` component expects `boolean` values, but data may arrive as strings (`'yes'`/`'no'`). Neither circle gets filled.
3. **PSP Authorization cut off after page 1** — Missing the Authorization section, NOTICE block, and signature. The print CSS uses `position: fixed` which prevents multi-page overflow.
4. **Company Testing Policy cut off** — Same print CSS issue clips the acceptance checkbox and signature block.

### Root Causes

- **Print CSS**: `position: fixed` in `printDocument.ts` prevents content from flowing across multiple pages.
- **Signature loading**: Private bucket URLs need auth headers. Browser print won't fetch them. Must convert to base64 data URLs before printing.
- **Type mismatch**: `AnswerRow` does strict boolean checks, but values may be stored/returned as strings.

### Plan

#### 1. Fix `printDocument.ts` — Enable multi-page print

Change `position: fixed` to `position: absolute` (or `static`) so content naturally flows across print pages. This fixes the PSP Authorization and Company Testing Policy being cut off.

#### 2. Fix signature rendering in all 4 document components

Before printing, pre-fetch the signature image URL as a blob, convert to a base64 data URL, and pass it to the document component. This ensures the signature renders in the printed PDF.

Changes:
- Add a `preloadSignatureUrl` helper (e.g., in `src/lib/printDocument.ts`) that fetches the image and returns a data URL
- Update the "Download PDF" handler in `ApplicationReviewDrawer.tsx` to pre-convert the signature URL before rendering the document
- Alternatively, store a `signatureDataUrl` state and pass it to each doc component

#### 3. Fix DOT Drug & Alcohol answer display

Update `DOTDrugAlcoholQuestionsDoc.tsx`:
- Normalize the answer values: convert string `'yes'`/`'no'` to boolean before passing to `AnswerRow`
- Update the `AnswerRow` component to handle both string and boolean inputs
- Fix the conditional checks (`=== false`) to also handle `'no'` string

#### 4. Fix `sap_process` handling

Same normalization — the `sap_process` field uses `'yes'`/`'no'` strings in the form but is typed as `boolean | null` in the DB. Ensure the SAP section renders correctly regardless of value type.

### Files Changed

| File | Change |
|------|--------|
| `src/lib/printDocument.ts` | Change `position: fixed` to `position: absolute`; add `preloadImageAsDataUrl` helper |
| `src/components/management/ApplicationReviewDrawer.tsx` | Pre-convert signature URL to data URL before rendering doc components for print |
| `src/components/application/documents/DOTDrugAlcoholQuestionsDoc.tsx` | Normalize string/boolean values; fix `AnswerRow` to handle both types |
| `src/components/application/documents/FCRAAuthorizationDoc.tsx` | Accept pre-loaded signature data URL |
| `src/components/application/documents/PreEmploymentAuthorizationsDoc.tsx` | Accept pre-loaded signature data URL |
| `src/components/application/documents/CompanyTestingPolicyCertDoc.tsx` | Accept pre-loaded signature data URL |

