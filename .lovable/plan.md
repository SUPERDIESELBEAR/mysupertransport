## Goal

When staff send a **test PEI email** from `SendTestPEIDialog`, the "View signed FCRA authorization" button currently links to a real release URL that resolves nothing (no application, no signature). Instead, the test email should link to a **self-contained sample release page** that is visually identical to the real one but clearly watermarked **"SAMPLE — TEST EMAIL ONLY"** and uses fake applicant data, with no database lookup.

## Approach

Use a sentinel token (`sample`) in the test email's `releaseUrl`. The existing `/pei/release/:token` route detects this token client-side, skips the edge-function call, renders the FCRA doc with hard-coded sample data, and overlays a diagonal watermark. No edge function, database, or audit-log changes.

## Changes

### 1. `src/components/pei/SendTestPEIDialog.tsx`
- Add a `releaseUrl` to the test `templateData`:
  ```
  releaseUrl: 'https://mysupertransport.lovable.app/pei/release/sample'
  ```
- Update the dialog description to mention that the FCRA release link in the test email opens a sample document.

### 2. `src/pages/PEIRelease.tsx`
- Detect the sentinel: `const isSample = token === 'sample'`.
- When `isSample`:
  - Skip the `pei-release-fcra` invocation.
  - Synthesize a `data` object with sample applicant fields (Test Applicant, sample DOB, `typed_full_name`, `signed_date = today`, the three `auth_*` flags `true`) and `pei.employer_name = 'Sample Trucking Co.'`.
  - Set `signatureDataUrl = null` (FCRAAuthorizationDoc renders the typed name fallback).
- Render a fixed, semi-transparent diagonal watermark overlay on the document card reading **"SAMPLE — TEST EMAIL ONLY"** (CSS `position: absolute; transform: rotate(-22deg); pointer-events: none; opacity: 0.18`). Watermark must also appear in the printed PDF (include in the `#fcra-release-doc` element so `openPrintableDocument` clones it).
- Add a small amber notice above the document: "This is a sample FCRA authorization included in test PEI emails. No real applicant data is shown."
- Keep the Letter/A4 toggle and Save-as-PDF flow working — the printed copy will also carry the watermark.

### 3. `mem://features/pei/fcra-release-link.md`
- Append a short note documenting the `sample` sentinel token and that test emails route to it.

## Out of scope

- No changes to `pei-release-fcra` edge function (sample never reaches it).
- No changes to email templates — they already render the `releaseUrl` button when present.
- No audit-log entry for sample views (intentional — purely client-side render).

## Verification

After implementation:
1. Send a test initial PEI email to a personal inbox.
2. Click the "View signed FCRA authorization" button → opens `/pei/release/sample`.
3. Confirm the watermark renders on screen and in the saved PDF (Letter and A4).
4. Confirm a real PEI release link (non-`sample` token) still loads applicant data normally.
