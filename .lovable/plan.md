# Fix: "Print Application" opens a blank about:blank tab

## Root cause
`SubmittedApplicationSnapshot.tsx` `handlePrint()` calls `window.open('', '_blank', 'width=900,height=1100')` and then writes HTML into that new window. In Chrome (and other modern browsers), popup blockers and third-party cookie / cross-origin isolation policies often intercept this and leave the tab stranded at `about:blank`, exactly matching the screenshot. Even when it isn't fully blocked, some Chrome profiles now ignore `document.write` after navigation events, so the window renders empty.

Every other Print flow in the app (Application Review Drawer, standalone FCRA / DOT docs) already uses the shared `printDocumentById` helper from `src/lib/printDocument.ts`, which:
- clones a hidden DOM node into the current tab
- injects a scoped `@media print` stylesheet
- calls `window.print()` directly (no popup)
- has a mobile / popup-blocker fallback overlay built in

The submitted-application print button is the only place still using the raw `window.open` approach — so it's the only one that breaks.

## Change
Convert `SubmittedApplicationSnapshot`'s Print button to the same pattern used by `ApplicationReviewDrawer`.

### Steps
1. **`src/components/management/SubmittedApplicationSnapshot.tsx`**
   - Remove `handlePrint` (the `window.open` + `document.write` block).
   - Wrap the on-screen snapshot content in a container with `id="submitted-application-print-content"`.
   - Replace the Print button's `onClick` with:
     ```ts
     printDocumentById(
       'submitted-application-print-content',
       `Application — ${a.first_name ?? ''} ${a.last_name ?? ''}`.trim()
     );
     ```
   - Import `printDocumentById` from `@/lib/printDocument` (the file already imports `preloadSignatureDataUrl` from the same module).
   - Drop the now-unused `toast` popup-blocked message for this handler.

2. No schema, edge function, or route changes.

## Why this fixes it
- No new window is opened, so popup blockers can't strand the user on `about:blank`.
- Uses the same helper already proven reliable for the Application Review print flow and standalone FCRA / DOT docs.
- Preserves signature rendering because the on-screen snapshot already uses `preloadSignatureDataUrl` (fixed in the earlier signature-display work).

## Verification
- Open a driver → Submitted Application panel → click **Print Application**.
- The native browser print dialog appears in-tab with the full application content (personal, CDL, employers, disclosures, signature).
- Cancel → returns to the page cleanly (no leftover overlay).
- Test in Chrome desktop and iOS Safari (mobile fallback overlay path).
