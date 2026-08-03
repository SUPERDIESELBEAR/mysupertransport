# ICA page: the "Read & Acknowledge Required" card

## What I verified

The request makes sense — a driver should never see an acknowledgment prompt on a fully executed ICA.

But that card no longer exists in the current code. A repo-wide search for "Read & Acknowledge Required", "Record Acknowledgment", and the checkbox copy in the screenshot returns nothing. The driver ICA screen (`OperatorICASign.tsx`) now renders only:

- Fully executed -> green "ICA Fully Executed" banner (plus "Signed by your truck owner — a copy is filed in your DOT binder." when the driver isn't the signer)
- Not yet signed, driver on a truck-owner unit -> read-only "Your truck owner signs this ICA" notice, no signature pad
- Not yet signed, the actual signer -> gold "ready to sign" banner

The acknowledgment step was removed with the single-signer ICA work. So the screenshot is almost certainly a **stale cached build** of the installed PWA on that phone, not a live bug.

## Plan

1. Load the ICA screen for a fully executed, truck-owner-signed driver in a headless browser against the current build and capture a screenshot, to prove the acknowledgment card does not render.
2. If it does render (i.e. some other surface still shows it), remove that block so nothing acknowledgment-related appears once `status = fully_executed`.
3. If it does not render (expected), the fix is delivery, not UI: confirm the app's version-check / service-worker update path forces the phone onto the new build, and give the driver a one-line refresh step (close and reopen the installed app, or pull to refresh) to clear the cached screen.

## Technical notes

- Component: `src/components/operator/OperatorICASign.tsx`; gating flags `isFullyExecuted`, `isReadOnlyViewer`, `canSign`.
- Update path already present: `src/hooks/useVersionCheck.tsx`, `public/version.json`, `public/service-worker.js` — step 3 only inspects these; changes there only happen if the check shows the cached build can persist.
- No database or edge function changes.
