

## Document Viewing Audit — Findings & Fix Plan

### Audit Summary

I reviewed every document viewing surface across the app. Here's what I found:

**Working correctly (no changes needed):**
- Application Review Drawer (CDL, Med Cert, Signature) — generates fresh signed URLs
- Pipeline Operator Detail Panel — Stage 2 docs, PE Receipt, CDL/Med Cert (recently fixed)
- Inspection Binder (Admin + Operator views) — uses signed URLs + blob-based viewer
- Driver Document Vault — re-signs URLs on every fetch
- Truck Photo Grid Modal — generates signed URLs on fetch
- Document Hub, Service Library, Resource Library — all use in-app viewers

**Inconsistent (functional but not using in-app viewer):**

Three areas use raw `<a href target="_blank">` links that open files in a new browser tab instead of the unified in-app `FilePreviewModal`. This means they bypass the blob-fetch workaround that prevents `X-Frame-Options` issues and they lose the consistent close/zoom UI.

| Location | File | What it affects |
|----------|------|----------------|
| Operator Document Upload — Stage 2 doc "View" links | `OperatorDocumentUpload.tsx` (3 places: ~line 302, 406, 492) | Form 2290, Truck Title, Truck Inspection, Registration, PE Receipt, Insurance Cert — viewed by operators |
| Staff Pipeline — Insurance Cert "View" link | `OperatorDetailPanel.tsx` (~line 4929) | Insurance certificate viewed by staff |

### Fix

**File: `src/components/operator/OperatorDocumentUpload.tsx`**
- Import `FilePreviewModal` from the inspection DocRow module
- Replace all three `<a href={doc.file_url} target="_blank">View</a>` patterns with a button that opens the in-app `FilePreviewModal`
- Since stored URLs are already full signed URLs, pass them directly to the modal (no re-signing needed)

**File: `src/pages/staff/OperatorDetailPanel.tsx`**
- Replace the insurance cert `<a href target="_blank">` with an async `onClick` that generates a fresh signed URL and opens the existing `stage2Preview` modal

### Files changed

| File | Change |
|------|--------|
| `src/components/operator/OperatorDocumentUpload.tsx` | Replace 3 `target="_blank"` links with in-app FilePreviewModal |
| `src/pages/staff/OperatorDetailPanel.tsx` | Replace insurance cert `target="_blank"` link with signed-URL + in-app preview |

---

After this fix, every document viewing surface in the app will use the unified in-app viewer. Then we can move on to reviewing the truck photos section as you mentioned.

