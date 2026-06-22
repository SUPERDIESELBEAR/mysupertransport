## Critical Block — Implementation Plan

Fixing all 8 critical items from the audit. Scope is intentionally narrow: each fix is targeted, no refactors beyond what the issue requires.

### Driver PWA

1. **`min-h-screen` → `min-h-dvh`** on every driver-facing page so buttons don't hide behind iOS Safari's URL bar.
   Files: `LoginPage.tsx`, `SplashPage.tsx`, `WelcomeOperator.tsx`, `ResetPassword.tsx`, `ApplicationStatus.tsx`, `SubmitSSN.tsx`, `InstallApp.tsx`, `PEIRelease.tsx`, `PEIRespond.tsx`, `ApplicationApprove.tsx`, `InspectionSharePage.tsx`.

2. **`InspectionSharePage.tsx` PDF on iOS** — `<iframe>` PDFs render blank on iOS Safari (this is the *roadside officer* page). Add a prominent "Open / Download PDF" button as a reliable fallback, detect iOS, and surface the button up-front instead of relying on the iframe.

3. **`ApplicationStatus.tsx:114` dead CTA** — wire "Complete Account Setup" to navigate to the proper next-step destination (or hide it when no action is available).

4. **`Step9Signature.tsx:61` silent upload failure** — surface the error to the user via toast, keep `sigSaved=false`, and prevent submit-time confusion by showing an inline error.

5. **`OperatorPortal.tsx` jank** — full split-out is a larger refactor; for the critical pass, lazy-load the heavy panels (Inspection Binder, Service Library, Status Page, etc.) via `React.lazy` so initial portal mount and per-view switches don't re-render all panels. Leaves business logic intact.

### Management

6. **Icon-only buttons missing `aria-label`** — add labels to:
   - `NotificationBell.tsx:262` (Bell trigger) + `aria-expanded`/`aria-haspopup`.
   - `StaffLayout.tsx:353` (hamburger) and `:360` (sidebar collapse).

7. **`IdleWarningModal.tsx:61-72` swapped semantics** — make "Stay signed in" the primary `AlertDialogAction` (already is) and "Sign out now" use `AlertDialogCancel` with `variant="destructive"` styling so reflexive Enter doesn't accidentally sign the user out. Also set `autoFocus` on "Stay signed in".

8. **`BinderFlipbook.tsx:517` modal a11y** — add `role="dialog"`, `aria-modal="true"`, `aria-labelledby` to the portal container, and implement a basic focus trap (focus first nav button on open, restore prior focus on close).

### Out of scope for this pass
- Splitting mega-components (PipelineDashboard, ManagementPortal, OperatorPortal beyond lazy-loading) — covered in later High/Medium items.
- All non-critical findings (items 9–57) — queued for follow-up.

### How you'll verify visually

After implementation, you'll be able to see the changes in the live preview:

- **Items 1, 7, 8, 6** — visible right in the preview URL.
  - Resize to mobile or use the device toggle above the preview (phone icon) to confirm `min-h-dvh` pages no longer clip buttons.
  - Open Notifications bell, hamburger, sidebar collapse — hover/inspect to confirm accessible name.
  - Wait for the idle warning modal (or temporarily lower idle timeout to test) and confirm "Stay signed in" is the highlighted primary button.
  - Open any document binder → click a doc to launch BinderFlipbook → press Tab and Escape to confirm focus is trapped + restored.
- **Item 2** — visit `/inspect/<token>` on an iOS device (or iOS simulator / Safari responsive mode) to see the new download CTA.
- **Item 3** — go to `/status` when application is approved; the "Complete Account Setup" button now navigates.
- **Item 4** — on Step 9 of `/apply`, temporarily simulate an offline state (DevTools → Network → Offline) and draw a signature; toast + inline error will surface.
- **Item 5** — open `/dashboard` as an operator; initial JS payload drops and per-view switches feel smoother (verifiable in DevTools → Network/Performance).

I'll also call out the exact preview URL and any specific click path to reproduce each fix when I finish.
