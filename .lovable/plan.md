## Findings

Two separate driver reports point to the same fragile area: the front-facing driver portal currently mixes URL-based navigation, temporary requested view state, automatic default-tab normalization, and refresh/version logic. That can make a tap flash white, refill the progress tracker, then land back on Status instead of the selected page.

For the ICA report, the **Sign ICA Now** button is a navigation CTA into the ICA tab. If navigation bounces back, it appears as if the button “refreshes” the page. There is also a backend signing-path risk for truck-owner/owner-operator ICA signing: the UI can submit owner contact edits, but the backend column whitelist currently rejects those non-staff field changes.

## Plan

1. **Stabilize driver navigation as URL-only**
   - Remove the extra “requested view” override layer that can get stuck or be cleared by data refreshes.
   - Make the rendered driver page derive from one source of truth: `?tab=` in the URL.
   - Keep the existing explicit tab URLs (`/dashboard?tab=...`, `/operator?tab=...`) but stop any data refresh from forcing the user back to Status unless the URL truly has no tab.

2. **Make default-tab normalization one-time and safe**
   - Only auto-normalize an empty driver URL once on first load.
   - Never normalize over a valid requested tab like `?tab=ica`, `?tab=messages`, `?tab=documents`, etc.
   - Preserve non-tab query params such as `source=pwa` without letting them reset the screen.

3. **Fix all driver CTA buttons that navigate between views**
   - Ensure CTA buttons such as **Sign ICA Now**, **Review & Sign Now**, mobile menu buttons, and status action buttons explicitly use non-submit button behavior.
   - This prevents accidental browser form submission/page reload behavior if any CTA is rendered inside or near a form-like container.

4. **Fix ICA tab entry and signing reliability**
   - Keep **Sign ICA Now** as an in-app navigation to the ICA tab, not a page refresh.
   - Add a direct fallback: if navigation to ICA fails to confirm, force-replace the URL to `?tab=ica` instead of staying on Status.
   - Improve ICA save handling so the user sees a friendly message if the agreement cannot be loaded or saved.

5. **Patch owner-operator ICA signing backend rule**
   - Update the backend whitelist so owner-operator signers can save the owner contact fields the ICA screen intentionally allows them to edit.
   - Keep all protected contract fields locked for drivers/owners.
   - Preserve the existing staff/admin full-access behavior.

6. **Clean up stale installed-app behavior**
   - Add a safe one-time cleanup for stale app-shell service workers/caches on the published installed web app, without adding offline mode.
   - This addresses drivers who removed/reinstalled the home-screen app but may still be affected by old browser-controlled app state.

7. **Add targeted diagnostics for this issue**
   - Keep lightweight navigation tracing, but add clearer entries for: tap received, URL written, tab rendered, and unexpected tab reset.
   - Add ICA-specific trace entries for CTA click, ICA screen mounted, contract loaded, and signing save failure stage.
   - These traces stay local/non-sensitive and help confirm whether a future report is a route reset, stale installed app, or backend save failure.

8. **Verify with browser testing**
   - Test public driver portal navigation between Status, Documents, Messages, Doc Hub, ICA, Binder, and FAQ.
   - Test direct deep links like `/dashboard?tab=ica` and `/operator?tab=ica`.
   - Test mobile-size navigation behavior and confirm the progress tracker no longer refills unless the user intentionally returns to Status.

## Expected result

- The driver who is stuck on one page should be able to move between app screens without the white flash/reset loop.
- The driver clicking **Sign ICA Now** should land on the ICA screen consistently.
- Owner-operator ICA signing should no longer be rejected by the backend when allowed owner contact fields are included.