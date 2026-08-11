# Fix: clicking a driver name in the Onboarding Pipeline doesn't open their file

## What I found

I reproduced this in a signed-in browser session against the live app. The user reports the bug occurs in Firefox but not in Chrome, so the fix must be verified in Firefox specifically.

Clicking a driver name (both in the "Active — Open Onboarding Items" list and in the main pipeline table) does set the app to the driver profile view — after about 2 seconds of a blank/spinner area the profile does render. Two concrete problems make it look like "nothing happened, the page just refreshed":

1. **The address bar is not updated.** After clicking "Ali Mohamed" the URL stayed `?view=pipeline` for the entire session — the driver id (`?view=operator-detail&op=…`) was never written. In another run the URL was written correctly and then flipped back to `?view=pipeline`. So the write is intermittent.

   Cause: the management portal has two competing URL effects. A "reader" effect (URL -> view) sets a `skipNextUrlSync` flag, and a "writer" effect (view -> URL) throws away exactly one write whenever that flag is set. When any unrelated URL change happens in the same render cycle as the click, the flag is on and the driver-profile write is swallowed. Because the URL still says `pipeline`, the next time the reader effect runs it can push the view back to the pipeline — the panel closes and the user lands back on the list, which reads as a refresh.

2. **No feedback while the profile loads.** For ~2 seconds after the click there is no header, no driver name, nothing to indicate the click registered — on a slower connection this is the whole perceived bug.

Secondary observation (not the main cause, but related noise): opening the profile pushes ~10 history entries from the modal back-button hook, so pressing browser Back afterwards appears to do nothing.

## The fix

**1. Make opening a driver authoritative over the URL**
- In `src/pages/management/ManagementPortal.tsx`, when a driver is opened (`onOpenOperator`, `onOpenOperatorWithFocus`, `onOpenOperatorAtStage`, and the binder variant), write `?view=operator-detail&op=<id>` to the URL in the same handler instead of relying on the deferred writer effect.
- Clear the `skipNextUrlSync` flag in those handlers so an in-flight external-navigation flag can never swallow the write.

**2. Stop the reader effect from bouncing the view back**
- Only react to a URL `view` value when it actually differs from the value the portal itself last wrote. Track the last URL the writer produced and ignore reader runs that match it, so a stale `?view=pipeline` can no longer close an open driver profile.

**3. Add immediate feedback on click**
- Show the driver profile shell (back button + driver name placeholder + skeleton) as soon as a driver is selected, instead of an empty area, so the click is visibly acknowledged while data loads.

**4. Quiet the history spam**
- In `src/hooks/useBackButton.ts`, guard against pushing a history entry when one is already pending for that consumer, so opening the profile no longer stacks ~10 duplicate entries and browser Back works in one press.

## Verification

Drive the app in a headless browser signed in as staff:
- Click a driver from the "Active — Open Onboarding Items" list and from the main pipeline table; confirm the URL becomes `?view=operator-detail&op=<id>` and stays there.
- Reload on that URL and confirm the same driver profile reopens.
- Confirm the profile shell appears immediately on click.
- Press browser Back once and confirm it returns to the pipeline.
- Repeat the above in Firefox specifically, because the reported failure only happens there.

## Technical notes

Files touched: `src/pages/management/ManagementPortal.tsx` (URL reader/writer effects and the open-driver handlers), `src/pages/staff/OperatorDetailPanel.tsx` (loading shell), `src/hooks/useBackButton.ts` (duplicate history push guard). No database or backend changes.
