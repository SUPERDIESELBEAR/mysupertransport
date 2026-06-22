## Problem

After visiting **Broadcast Email** in the management dashboard and then navigating to another section (e.g., Overview, Pipeline), a browser refresh wrongly lands the user back on Broadcast Email instead of the page they were last viewing.

## Root cause (likely)

`ManagementPortal.tsx` persists the current section to the URL via `?view=...`. The URL writer effect compares the *current* `window.location.search` against the next intended value and only calls `setSearchParams` when they differ. In practice we're seeing the URL get stuck on `?view=broadcast` after navigating away from Broadcast — either because:

1. The writer effect's comparison or stale-closure timing misses the transition (the dependency array includes `setSearchParams`, which is stable, but the effect reads `window.location.search` imperatively — if React batches a state update with no other observable change the writer is skipped), **or**
2. A race with the lazy URL initializer on a follow-up render re-seeds `view` from the still-stale URL.

Either way, the URL persistence path is fragile for a "remember last section" feature. The fix is to make persistence explicit and robust instead of inferring it from a self-comparing URL writer.

## Fix

Keep the existing deep-link behavior (notification links like `?op=...`, `?app=...`, `?view=applications&app=...` must still work), but make the "remember last section on refresh" mechanism authoritative via `sessionStorage` so it cannot get stuck on a stale value.

### Changes in `src/pages/management/ManagementPortal.tsx`

1. **Initial state (lazy `useState` for `view`)**:
   - If the URL has an explicit `?view=` **and** any deep-link param (`op`, `app`), honor the URL as before (notification deep-link path).
   - Otherwise, prefer `sessionStorage.getItem('mgmt_last_view')` (validated against the allowed view list).
   - Fall back to `?view=` from the URL, then `'overview'`.

2. **Writer effect**:
   - On every `view` change, write the current view to `sessionStorage` (`mgmt_last_view`).
     - Skip persisting the two transient views that shouldn't be "sticky" on refresh: `'operator-detail'` and `'vehicle-detail'` (these require a selected ID; saving them would 404 the panel on refresh). For these, fall back to a sensible parent (`'pipeline'` / `'vehicle-hub'`).
   - Keep writing `?view=`, `?op=`, `?status=` to the URL for shareable links — but no longer rely on the URL as the source of truth for refresh restoration.

3. **Specific guard for `broadcast`** (defensive, addresses the reported symptom directly): when leaving Broadcast Email via `handleNavigate`, also strip any lingering `?view=broadcast` from the URL by calling `setSearchParams` with an explicit reduced params object, so even if the writer effect ever misses, the URL cannot be left pinned to `broadcast`.

4. **No changes to**:
   - Notification deep-link handler (`?op=...`, `?app=...`) at the top of the component.
   - `handleNavigate` semantics (unsaved-changes guard for `operator-detail` stays).
   - Any other section, sidebar, or component.

### Verification

- Open Broadcast Email → URL becomes `/dashboard?view=broadcast`.
- Click Overview → URL becomes `/dashboard`; `sessionStorage.mgmt_last_view === 'overview'`.
- Refresh → lands on **Overview**.
- Repeat with Pipeline, Compliance, Drivers, etc. — refresh lands on the most recently viewed section.
- Notification link `/dashboard?view=applications&app=<id>` still opens Applications with the review drawer.
- Operator deep link `/dashboard?op=<id>` still opens the operator detail panel.
- Refresh while on `operator-detail` lands on `pipeline` (intended — detail views require a selected record and aren't safely restorable without re-deep-linking).

## Out of scope

- Staff/Dispatch/Operator portals (no reported issue there).
- Persisting deeper sub-state (active tab inside Broadcast, filters inside Compliance, etc.) — this plan only restores the top-level section.
- Cross-tab persistence — `sessionStorage` is per-tab on purpose so different tabs can sit on different sections.
