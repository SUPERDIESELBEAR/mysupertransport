## Goal

After a driver signs and submits the Onboard Systems Assignment Sheet, the screen should convert in place into a clean signed receipt — no lingering form — and the driver leaves on their own with a Done control.

## Current behavior

In `src/components/operator/OperatorOSASSign.tsx`, signing updates local state and shows a toast. Because `alreadySigned` becomes true, the signature form is replaced by a small "Signed on …" strip, but the rest of the page still reads as the interactive sheet (device checkboxes, terms checkbox, signing-oriented headers), so it feels like nothing happened.

## Changes (all in `OperatorOSASSign.tsx`)

1. **Post-sign receipt mode.** Track a `justSigned` state set on successful submit. When the sheet is signed (either loaded already-signed or `justSigned`), render a receipt layout instead of the signing layout:
   - Header block: green check + "Assignment Sheet Signed", unit number, assignment date, signer name, signed timestamp.
   - Devices rendered as a static confirmed list (no checkboxes, no interactive labels) with the check icon per row.
   - The full terms via the existing shared `AssignmentSheetTerms`, using `acknowledgedBy` / `acknowledgedAt` so it reads as an affirmed acknowledgement rather than a checkbox.
   - Signature image block (existing `useSignatureUrl` handling, including the blank-signature re-sign fallback, which must still be reachable).
2. **Scroll to top** when entering receipt mode so the driver sees the confirmation header, not the bottom of the page.
3. **Done control.** A primary "Done" button at the bottom of the receipt that calls `onBack` (falling back to `onComplete`) — no auto-redirect, no timer. Keep the existing top Back button.
4. Keep the existing success toast and the `onComplete?.()` callback so the parent portal refreshes its Onboard Systems badge/status.

No database, RLS, or edge function changes; presentation and local state only.

## Verification

Load the signing view in Playwright at a mobile viewport, complete a signature, and confirm the page swaps to the receipt (checkmark header, static device list, acknowledged terms, signature image, Done button), scrolls to top, and stays put until Done is tapped.
