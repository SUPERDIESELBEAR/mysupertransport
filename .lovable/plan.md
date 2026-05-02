## The problem

Every portal in the app (Management, Staff, Operator, Dispatch) is mounted under a single catch-all route like `/management/*` or `/staff/*`, and the active section/tab inside is tracked only in React component state (`useState`). When you press the browser refresh button:

1. The browser reloads the URL (e.g. `/management/*`).
2. The portal mounts fresh and initializes `view` to its default — `overview` for Management, `pipeline` for Staff, `home` for Operator.
3. Whatever section you were on is lost.

The URL never reflects the section you were viewing, so the browser has nothing to restore on refresh.

The good news: the Management and Operator portals already partially read `?view=...` from the URL on first load. They just never write back to it when you click a sidebar item. We can finish the wiring instead of redesigning routing.

## What I'll do

Make the URL the single source of truth for the active section in each portal, so refresh restores exactly what you were on.

### 1. Management Portal (`src/pages/management/ManagementPortal.tsx`)

- Replace the `useState<ManagementView>` "view" with a small helper that reads from and writes to `?view=...` via `useSearchParams`.
- When the user clicks any sidebar item or any in-page shortcut that currently calls `setView(...)`, also push the new view into the URL using `setSearchParams({ view }, { replace: true })`. (`replace` so we don't pollute browser back history with every click — back still takes you to the previous real page.)
- Preserve the existing `status` filter param so the Applications tab also restores its filter.
- For deep-state like `selectedOperatorId` (operator detail drawer), add an optional `&op=<id>` param so that refreshing on an open operator detail re-opens the same operator. If the id is missing on reload, fall back to the pipeline view.

### 2. Staff Portal (`src/pages/staff/StaffPortal.tsx`)

- Same pattern: drive `currentView` from `?view=...` instead of `useState`.
- Keep the existing `?tab=...` reader for backwards-compatibility with notification deep links.

### 3. Operator Portal (`src/pages/operator/OperatorPortal.tsx`)

- It already initializes `view` from `?tab=...`. Add the missing write-back: every `setView(...)` call also updates `?tab=...`.
- Also persist `binderView` (`?binder=list|pages`) so the inspection binder stays on the page you opened.

### 4. Dispatch Portal (`src/pages/dispatch/DispatchPortal.tsx`)

- Persist `activeTab` (filter) and `viewMode` (`cards`/`table`) into the URL as `?tab=...&mode=...`.

### 5. Small shared helper

Add a tiny `useUrlState` hook in `src/hooks/useUrlState.ts` that wraps `useSearchParams` so each portal can do:

```ts
const [view, setView] = useUrlState<ManagementView>('view', 'overview', allowedViews);
```

This keeps each portal readable and makes future tabs trivial to persist.

## What stays the same

- No change to `App.tsx` route definitions — `/management/*`, `/staff/*`, `/operator/*`, `/dispatch/*` still work.
- No change to login/redirect behavior.
- No change to how notifications deep-link into a section (those already use query params, and we'll keep the same param names where they exist).
- Nothing on the backend changes.

## How it will feel

- You're on Management → Pipeline → click refresh → you stay on Pipeline.
- You're on Operator Portal → Inspection Binder → refresh → still on Inspection Binder.
- You can now bookmark or share a link like `/management?view=drivers` and land directly there.
- Browser Back/Forward will move between sections you visited, which is a nice bonus.

## Risk / scope

Low risk. The change is localized to four portal files plus one new 30-line hook. No data model, RLS, edge function, or auth changes. I'll keep the existing query-param names that notifications and emails already link to so nothing breaks.