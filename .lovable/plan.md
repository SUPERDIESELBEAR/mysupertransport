# Fix: applicant signature image not displaying in Submitted Application snapshot

## Problem
In `src/components/management/SubmittedApplicationSnapshot.tsx` (lines 394–403), the signature image is rendered with the raw stored path:

```tsx
<img src={a.signature_image_url} alt="Applicant signature" ... />
```

The `signatures` storage bucket is private. Browsers hit that URL without a token, get **403 Forbidden**, and show a broken-image icon. The user's screenshot confirms this on Emma Mueller's submitted application.

`ApplicationReviewDrawer.tsx` renders the same image correctly by preloading a signed URL through `preloadSignatureDataUrl` (`src/lib/printDocument.ts`). Only the Snapshot view was missed.

## Fix
Update `SubmittedApplicationSnapshot.tsx` to resolve the signature to a data URL before rendering, using the existing helper — no new API surface, no schema changes.

Concretely:
1. Import `preloadSignatureDataUrl` from `@/lib/printDocument`.
2. Add local state `const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null)`.
3. In a `useEffect` keyed on `a.signature_image_url`, call `preloadSignatureDataUrl(a.signature_image_url, 'signatures').then(setSignatureDataUrl)`.
4. Render `<img src={signatureDataUrl ?? undefined}>` and hide the block until the data URL resolves (or show a small "Loading signature…" placeholder while pending).

## Out of scope
- DL front/rear and medical cert (they use `docButton`, which handles signing already).
- ICA / EFT signatures elsewhere in the app.
- Any storage bucket policy changes — the bucket stays private; we sign at read time.

## Verification
- Open Emma Mueller's submitted application → scroll to the Signature section → signature image renders (was broken before).
- Signed URL is short-lived (300s) but converted to a data URL for stable in-place render.
- Typecheck passes.
