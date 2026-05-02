## The problem

After yesterday's URL-persistence change, the Staff Portal has **two `useEffect` hooks that both touch the URL** and step on each other:

1. **Reader effect** (`StaffPortal.tsx` lines 117–129) watches `searchParams` and, on every change, can force `currentView` based on `?tab=`, `?operator=`, or `?view=`.
2. **Writer effect** (lines 132–139) watches `currentView` / `selectedOperatorId` and writes them back into `?view=` / `?operator=`.

Because both effects depend on `searchParams`, and the reader recognizes both `?tab=...` (legacy notification deep link) and `?view=...` (the new persistence key), clicking **Applicant Pipeline** after a refresh can cause this sequence:

- Click Pipeline → `currentView` becomes `'pipeline'`.
- Writer deletes `view` and `operator` from the URL.
- Reader fires (URL changed). If a stale `?tab=...` is still in the URL from an earlier notification link, the reader **forces the view back** to `notifications` (or whatever `tab` says).
- Writer fires again, adds `?view=notifications`.
- Reader fires again, still sees `?tab=...`, forces view again.

That shows up as a screen that "spazzes" between Pipeline and another section every time the menu is clicked, and only stops when the user clicks a different menu item that finally aligns the two params.

The same class of bug exists, more subtly, in the other portals we changed (Management, Operator, Dispatch). All four use the same "reader effect + writer effect on the same param set" pattern.

## What I'll do

Collapse the two-effect pattern into a single, deterministic flow per portal:

### 1. Staff Portal (`src/pages/staff/StaffPortal.tsx`)

- **Remove the reader effect entirely** (lines 117–129). Initial state from the URL is already handled by the lazy `useState` initializer on line 44.
- **One-shot legacy migration**: on mount only, if the URL contains the old `?tab=notifications` or `?operator=...` params, translate them to `?view=notifications` / `?view=operator-detail&operator=...` and `replace` the URL. This preserves notification deep links without leaving a param around to fight the writer.
- **Keep one writer effect** that pushes `currentView` / `selectedOperatorId` into the URL, but make it not depend on `searchParams` itself — it should only run when the actual state changes. We'll read the current URL imperatively inside the effect to compute the diff.
- Result: clicking Applicant Pipeline sets state once, the URL is rewritten once, and nothing reads it back.

### 2. Apply the same fix to the other three portals

The same "two effects on the same params" pattern was added to:

- `src/pages/management/ManagementPortal.tsx` (`view`, `status`, `op`)
- `src/pages/operator/OperatorPortal.tsx` (`tab`, `binderView`)
- `src/pages/dispatch/DispatchPortal.tsx` (`page`, `filter`, `mode`)

Each one gets the same treatment: drop the reader effect that re-syncs from URL after mount, keep only the writer effect, and remove `searchParams` from the writer's dependency list so it can't cause a loop.

### 3. Sanity check refresh + deep links still work

After the change, verify by hand:

- Refresh on Staff → Compliance → still on Compliance.
- Refresh on Staff → Operator Detail (with `?operator=xxx`) → still on that operator.
- Click an old notification email link with `?tab=notifications` → lands on Notifications, URL gets normalized to `?view=notifications`, no flicker.
- Click Applicant Pipeline from any other section → goes there cleanly, no bounce.
- Repeat for Management, Operator, Dispatch portals.

## Technical details

The core change in each portal looks like this:

```ts
// BEFORE — two effects fighting each other
useEffect(() => {
  const tab = searchParams.get('tab');
  const view = searchParams.get('view');
  if (tab === 'notifications') setCurrentView('notifications');
  else if (view && allowed.includes(view)) setCurrentView(view);
}, [searchParams]);

useEffect(() => {
  const next = new URLSearchParams(searchParams);
  if (currentView !== 'pipeline') next.set('view', currentView);
  else next.delete('view');
  if (next.toString() !== searchParams.toString()) {
    setSearchParams(next, { replace: true });
  }
}, [currentView, selectedOperatorId, searchParams, setSearchParams]);

// AFTER — initial state from URL once, then one-way write
const [currentView, setCurrentView] = useState<StaffView>(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('tab') === 'notifications') return 'notifications';
  const v = params.get('view') as StaffView | null;
  return v && allowed.includes(v) ? v : 'pipeline';
});

// One-shot legacy param migration on mount
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  let changed = false;
  if (params.get('tab') === 'notifications') { params.delete('tab'); params.set('view', 'notifications'); changed = true; }
  if (changed) setSearchParams(params, { replace: true });
}, []); // mount only

// Writer — no searchParams dep, reads URL imperatively
useEffect(() => {
  const next = new URLSearchParams(window.location.search);
  if (currentView !== 'pipeline') next.set('view', currentView); else next.delete('view');
  if (currentView === 'operator-detail' && selectedOperatorId) next.set('operator', selectedOperatorId);
  else next.delete('operator');
  const current = window.location.search.replace(/^\?/, '');
  if (next.toString() !== current) setSearchParams(next, { replace: true });
}, [currentView, selectedOperatorId, setSearchParams]);
```

Removing `searchParams` from the writer's deps and removing the reader effect breaks the cycle entirely.

## Risk / scope

Low. Changes are confined to four portal files, no data, RLS, edge function, or auth changes. Refresh-to-restore behavior is preserved (initial `useState` still reads the URL). Notification email deep links still work via the one-shot mount migration.
