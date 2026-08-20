# Edit Load Button — Investigation Result and Test Gap Fix

## What I found

The button wiring is already correct in the current code, and both entry paths work end to end. What you hit was a stale client bundle, not a missing change.

Evidence, all gathered against the running app on real load ST26003 (Available):

- Source: `LoadDetailPage` renders `onClick={() => (onEdit ? onEdit() : navigate('/dispatch/loads/${id}/edit'))}`. There is no "coming soon" toast anywhere in `src` today. Git history shows that string existed in `LoadDetailPage.tsx` and was removed in a later commit — so the toast you saw is the previous build.
- Dispatch path, clicked through the real UI: row click landed on `/dispatch/loads/8028010c-.../`, then the Edit Load button navigated to `/dispatch/loads/8028010c-.../edit` and the edit form rendered hydrated (Total Load Value $2,000.00, stops populated).
- Management path, clicked through the real UI at `/dashboard?view=loads`: Edit Load switched the in-shell view to "Edit Load ST26003" with the Management sidebar intact and Loads still highlighted. It does not throw the user into the Dispatch Portal. The URL stays `?view=load-detail` because Management view state is not URL-synced — that matches every other Management view and is not specific to load editing.

So: only the button appeared wrong, the whole edit path is reachable, and the portal-aware pattern you asked for is already what is implemented.

## Why you saw the old behaviour

Your preview session is pinned to build `c2228d08` (visible in the current route's `__lovable_sha`). That bundle predates the edit-mode commit, so it still contained the toast handler. A hard refresh of the preview picks up the current build.

## How the gap was missed

Accurate criticism: the verification exercised `update_load_with_stops`, the double-counting guard, and the change-history card, plus a direct render of the edit form. Nothing clicked the Edit Load button. `src/pages/dispatch/__tests__/loadsRouting.test.tsx` covers list-to-detail routing but stops there, so a button still wired to a toast would have passed the whole suite.

## Proposed work

No production code change is required. The one thing worth adding is the missing entry-point coverage:

- Extend `src/pages/dispatch/__tests__/loadsRouting.test.tsx` with a Dispatch case: render Load Detail at `/dispatch/loads/:id`, click the "Edit Load" button, assert the router lands on `/dispatch/loads/:id/edit` and the edit form renders.
- Add a Management case: render `LoadDetailPage` with an `onEdit` spy, click the button, assert the spy fires — pinning that the host-supplied handler wins over the dispatch fallback, so a management user is never pushed onto a `/dispatch/*` path.
- Both assertions fail if the handler is ever replaced with a toast or a no-op.

If you would rather I also add a defensive change, the only candidate is making Management's load views URL-addressable (`?view=load-edit&loadId=...`) so a refresh mid-edit does not drop back to the overview. That is a separate ask; say the word and I will fold it in.
