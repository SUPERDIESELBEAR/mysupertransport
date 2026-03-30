

## Fix Download Across All Areas — Not Just DocRow

### Problem
The previous plan only fixes **one download link** in `DocRow.tsx`. There are **5 files** across the app with `<a download=...>` links pointing to cross-origin Supabase storage URLs. Browsers ignore the `download` attribute for cross-origin URLs in all of them, causing the file to open in a new tab instead.

### Affected Files

| File | Download Links | Has `useBlobUrl`? |
|------|---------------|-------------------|
| `src/components/inspection/DocRow.tsx` | 2 (lines 269, 413) | Yes |
| `src/components/operator/OperatorStatusPage.tsx` | 2 (lines 458, 620) | No |
| `src/components/operator/PEScreeningTimeline.tsx` | 1 (line 171) | No |
| `src/components/operator/OperatorResourcesAndFAQ.tsx` | 1 (line 103) | No |
| `src/components/documents/DocumentViewer.tsx` | 1 (line 114) | No |

### Solution

1. **Extract `useBlobUrl`** from `DocRow.tsx` into a shared hook (`src/hooks/useBlobUrl.ts`) so all files can use it
2. **Create a reusable `DownloadButton` component** (or a small `useBlobDownload` helper) that fetches the file as a blob and triggers a programmatic download via `URL.createObjectURL` + a temporary `<a>` click
3. **Replace all 6 download links** across all 5 files with the new pattern so downloads work reliably everywhere

### Files Changed

| File | Change |
|------|--------|
| New `src/hooks/useBlobUrl.ts` | Extract shared blob-fetching hook |
| New `src/lib/downloadBlob.ts` | Utility: fetch URL as blob → trigger download |
| `src/components/inspection/DocRow.tsx` | Use shared hook + blob download for both links |
| `src/components/operator/OperatorStatusPage.tsx` | Use blob download for both QPassport links |
| `src/components/operator/PEScreeningTimeline.tsx` | Use blob download for QPassport link |
| `src/components/operator/OperatorResourcesAndFAQ.tsx` | Use blob download for resource link |
| `src/components/documents/DocumentViewer.tsx` | Use blob download for document link |

### Technical Approach

The `downloadBlob` utility will:
```
fetch(url) → blob → createObjectURL → create temp <a download="name"> → click → revoke
```
This is same-origin so `download` attribute is honored. Each call site just needs: `onClick={() => downloadBlob(url, filename)}` instead of `<a href={url} download={name}>`.

