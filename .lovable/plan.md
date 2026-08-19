# Add "Loads" to the Management Portal sidebar

Give management and owner users their own entry point to the Loads list, rendered inside the Management Portal's own sidebar shell, reusing the exact same page component the Dispatch Portal uses.

## What you'll see

- A new **Loads** item (truck icon) in the Management sidebar's **Operations** group, directly below **Dispatch Board**.
- Clicking it shows the same Loads list — stat cards, search, status/equipment filters, responsive table — without leaving the Management sidebar.
- Clicking a load row opens the load detail placeholder in the same shell, with a "Back to Loads" button that returns to the list.
- Nothing about the Dispatch Portal changes: `/dispatch/loads` and its sidebar item keep working exactly as they do today.

## One page, two entry points

The Loads list and detail views stay in their existing files. They gain two optional props so a host portal can supply its own navigation instead of the hardcoded `/dispatch/loads` paths. When those props are absent, the components behave exactly as they do now in Dispatch.

## Note on the URL

The Management sidebar drives its sections with an internal `?view=` parameter rather than real paths (every other management section works this way, and the portal actively strips stray path segments). So the Management entry point will read `/dashboard?view=loads` rather than `/management/loads`. This is what keeps the page inside the Management shell — the alternative would bounce the user into the Dispatch Portal's sidebar. Dispatch keeps its real path-based URLs.

## Technical changes

**`src/pages/dispatch/LoadsListPage.tsx`**
- Add optional prop `onSelectLoad?: (id: string) => void`. Row and mobile-card click handlers call it when provided, otherwise fall back to the current `navigate('/dispatch/loads/' + id)`.

**`src/pages/dispatch/LoadDetailPlaceholderPage.tsx`**
- Add optional props `loadId?: string` and `onBack?: () => void`. Use `loadId ?? useParams().id` for the query and `onBack ?? (() => navigate('/dispatch/loads'))` for the back button.

**`src/pages/management/ManagementPortal.tsx`**
- Extend `ManagementView` and `ALLOWED_VIEWS` with `'loads'` (and `'load-detail'`, kept out of `ALLOWED_VIEWS` so a refresh lands back on the list, matching how `operator-detail`/`vehicle-detail` are handled).
- Add `selectedLoadId` state.
- Add the nav item `{ label: 'Loads', icon: <Truck className="h-4 w-4" />, path: 'loads' }` immediately after Dispatch Board in `navItems`. `Truck` is already imported (used by Vehicle Hub), matching the Dispatch sidebar icon.
- Render `<LoadsListPage onSelectLoad={id => { setSelectedLoadId(id); setView('load-detail'); }} />` for `view === 'loads'` and `<LoadDetailPlaceholderPage loadId={selectedLoadId} onBack={() => setView('loads')} />` for `view === 'load-detail'`, inside the existing `StaffLayout` children like every other section.

**No changes** to RLS, database tables, migrations, or `DispatchPortal.tsx`.

## Verification

- Extend `src/pages/dispatch/__tests__/loadsRouting.test.tsx` with cases that render the list with an `onSelectLoad` handler and assert a row click calls it with the load id (the management path), and that the detail view renders from a `loadId` prop with a working `onBack`.
- Run the existing role checks (dispatcher / management / owner render the page; operator is redirected) to confirm nothing regressed.
- Confirm in the preview that Loads appears under Dispatch Board, renders inside the Management shell without layout breakage, and that a management/owner session is never redirected away.
