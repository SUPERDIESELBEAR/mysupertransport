

## Fix: Signature Disappears During ICA Signing

### Root Cause

The signature canvas uses a `ResizeObserver` that fires every time the container resizes. On mobile (and sometimes desktop), when Dominic tapped the "typed name" input field, the soft keyboard opened, resizing the viewport. This triggered `rescaleCanvas`, which:

1. Calls `canvas.width = ...` — this **clears the canvas entirely** (HTML5 spec)
2. Attempts to restore the drawing asynchronously via `img.onload`
3. But if the restore fails or another resize fires before it completes, the canvas is left blank

Additionally, `react-signature-canvas`'s internal `isEmpty()` state gets out of sync with the actual canvas content (it tracks `beginStroke` calls, not pixel data). So after the canvas is visually cleared by the resize, `isEmpty()` could return either true or false unpredictably.

**Evidence from the database**: Dominic's contract (`c572d55a...`) still shows `status: sent_to_operator` with all contractor signature fields null. No signature file was uploaded to storage. This confirms `handleSign` either returned early (empty check) or was never called because the user saw a blank canvas.

### Fix — Two parts

**1. Remove ResizeObserver, set canvas size once on mount only**

The ResizeObserver is the direct cause. Replace it with a single initial sizing on mount. The ICA signing view has a fixed layout (`max-w-4xl`), so continuous resize tracking is unnecessary. If the container width is already set on mount, one pass is sufficient.

**2. Add user feedback when signature is missing**

Currently `handleSign` returns silently if `signedName` is empty or the signature pad is empty. Add a toast notification telling the user what's missing so they aren't left wondering why nothing happened.

### Files changed

| File | Change |
|------|--------|
| `src/components/ica/ICADocumentView.tsx` | Remove `ResizeObserver`; run canvas sizing once on mount via `useEffect`; keep the DPR-aware initial sizing but don't re-run it on resize |
| `src/components/operator/OperatorICASign.tsx` | Add validation toasts in `handleSign` when signature or name is missing instead of silent return |

