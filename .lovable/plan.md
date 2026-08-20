# Edit Load — Entry-Point Tests, Addressable Edit View, Dirty-Form Guard

Background settled: the button was never broken in current code; the toast came from a stale bundle. Remaining work is coverage plus the refresh-safety concern.

## Answer to your question first

Restoring the edit view on refresh does **not** restore the user's work. The edit form hydrates from the database through `fetchLoadForEdit` on mount, so a reload rebuilds the form from saved values and everything unsaved — the typed reason for a rate change, an attached file not yet uploaded, edited stop fields — is gone.

So addressability alone only gets the user back to the right screen. To protect the work itself, the plan adds a dirty-form guard alongside it. The two together are what makes the scenario you described non-destructive: the browser asks before a reload or tab close, in-app navigation asks before leaving, and if the user proceeds anyway they at least land back on the same load's edit form rather than the overview.

## 1. Entry-point test coverage

Extend `src/pages/dispatch/__tests__/loadsRouting.test.tsx`:

- **Dispatch case** — render Load Detail at `/dispatch/loads/:id` inside the dispatch routes, click the "Edit Load" button, assert the location becomes `/dispatch/loads/:id/edit` and the edit form renders (heading "Edit Load <load number>", load number field disabled).
- **Management case** — render `LoadDetailPage` with an `onEdit` spy, click the button, assert the spy fires exactly once and that no navigation to a `/dispatch/*` path occurred. This pins that the host-supplied handler wins over the dispatch fallback, so a management user is never thrown out of their shell.

Both fail if the handler is replaced with a toast or a no-op.

## 2. Addressable Management edit view (edit only)

Scope stays narrow: only `load-edit` becomes URL-addressable. `loads` and `load-detail` keep the current `?view=` pattern.

- When Management enters the edit view, write `?view=load-edit&loadId=<id>` via the existing `setSearchParams`.
- On mount, the existing URL-view sync reads `loadId` when `view === 'load-edit'` and seeds `selectedLoadId`, so a refresh returns to the same load's edit form instead of the overview.
- If `view=load-edit` arrives without a resolvable `loadId`, fall back to the loads list rather than rendering an empty form.
- Leaving edit (save or cancel) clears `loadId` from the URL and returns to `load-detail` as it does today.

## 3. Dirty-form guard on the load form (create and edit)

Applies to the load form in both modes and both portals, using the project's existing `useUnsavedChanges` hook and `UnsavedChangesDialog` so the behaviour matches the rest of the staff dashboard.

- Dirty signal comes from react-hook-form's `formState.isDirty` — in edit mode against the hydrated baseline, in create mode against the empty defaults.
- Parsed loads count as dirty with no extra machinery: the rate-confirmation parser already writes every extracted field with `shouldDirty: true`, so a parsed-but-untouched load is already dirty to react-hook-form.
- The signal additionally ORs in the attached source file, which lives in component state rather than the form, so an attached rate confirmation on its own counts as unsaved work.
- `beforeunload` warning while dirty, covering refresh and tab close — the browser's own prompt, which is the only thing that can intercept a reload.
- In-app exits (Back to Load, cancel, Management sidebar navigation) route through the hook's `guard()` so the user gets Save / Discard / Cancel instead of silent loss.
- The guard disarms on successful save so the post-save redirect is not interrupted.
- Create mode needs no different handling. The only create-specific piece is the file/parse dirty signal above, which is a single added condition on the shared guard, not a separate implementation. Dialog copy differs slightly: "Discard this load?" rather than "Discard changes?", since there is nothing saved to fall back to.

## Verification

- New routing tests plus the existing suite green.
- Manual: start an edit in Management, type a rate-change reason, refresh — confirm the URL restores the same load's edit form and the browser warned first.
- Manual: dirty the form, click Back to Load — confirm the unsaved-changes dialog appears and Cancel keeps the user on the form.
- Manual: parse a rate confirmation into a new load and navigate away without typing anything — confirm the guard fires.
