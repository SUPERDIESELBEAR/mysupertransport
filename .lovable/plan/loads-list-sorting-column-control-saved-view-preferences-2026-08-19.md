# Loads List: Sorting, Column Control, Saved View Preferences

Upgrade the existing Loads list (shared by Dispatch and Management portals) with sortable headers, a column visibility menu, a dispatcher filter, and per-user saved preferences — built as a reusable pattern for future list pages.

## 1. Database: `user_view_preferences`

New table with `view_key` (e.g. `loads_list`), `visible_columns` (jsonb), `sort_column`, `sort_direction`, `page_size`, `filters` (jsonb), timestamps, unique on `(user_id, view_key)`, index on `(user_id, view_key)`, `BEFORE UPDATE` trigger using `public.update_updated_at_column()`.

RLS: a user may select/insert/update/delete only rows where `user_id = auth.uid()`. No role override — management cannot see other users' preferences. Grants: SELECT/INSERT/UPDATE/DELETE to `authenticated`, ALL to `service_role`, nothing to `anon`.

One deviation from the request: `user_id` will **not** reference `profiles(id)`. In this database `profiles.id` is a separate key from the auth user id, and `loads.dispatcher_id` is the one that points at `profiles(id)`. Since the RLS rule is `user_id = auth.uid()`, the column must hold the auth user id, so it will be a plain `uuid not null` (matching how `staff_ui_preferences` already stores `user_id`). Same behavior, correct ownership semantics.

## 2. Columns available on the Loads list

Query extended to also pull `load_stops` (city, state, appointment_start, stop_sequence) and the dispatcher's name via `loads.dispatcher_id -> profiles`. Origin = lowest `stop_sequence`, destination = highest.

- Locked on: Load #, Status
- On by default: Broker, Driver, Equipment, Rate, Created
- Off by default: Dispatcher, Origin, Destination, Pickup Date, Delivery Date, Loaded Miles, Commodity, Weight, Load Type

Weight and Loaded Miles use thousands separators ("lbs" suffix on weight); dates use the existing short-date formatter.

## 3. Sorting

Every header except Status cycles: ascending → descending → back to the default (`created_at` descending), with a small caret on the active column. Columns that map directly to a `loads` column sort server-side in the Supabase query; derived columns (origin, destination, pickup date, delivery date, driver, broker, dispatcher name) sort client-side.

Status sorts by workflow order using the `load_status` enum sequence rather than alphabetically.

## 4. Column visibility menu

A "Columns" button in the filter row opens a popover with a checkbox per column. Load # and Status appear checked and disabled. Toggling applies immediately; a "Reset to defaults" action restores the default set. Styled to match the existing `PipelineColumnPicker`, including the badge showing how many columns are hidden.

## 5. Dispatcher filter

A third dropdown beside Status and Equipment: "All Dispatchers", "Unassigned", then each user holding the `dispatcher` role (from `user_roles` joined to `profiles`). Combines with the other filters using AND.

## 6. Persistence

Visible columns, sort column, and sort direction save to `user_view_preferences` under `view_key = 'loads_list'`, debounced (~600ms) like the existing staff preference hook. On load, saved values are applied; otherwise the defaults above. Search text and filter selections are not persisted.

## 7. Reusable pattern

- `src/hooks/useViewPreferences.ts` — generic hook keyed by `view_key`, returning `{ visibleColumns, sort, setVisibleColumns, setSort, reset, loaded }`, with localStorage seeding + debounced upsert (same shape as `useStaffUiPreferences`).
- `src/components/shared/ColumnVisibilityMenu.tsx` — generic version of the pipeline column picker, taking a column definition list with `locked` support.
- `src/components/shared/SortableTableHead.tsx` — header cell handling the 3-state click cycle and indicator.
- `src/lib/listSorting.ts` — comparator helpers, including enum-order sorting for status.
- `src/pages/dispatch/loadsColumns.ts` — the Loads-specific column definitions and accessors.

Future list pages (settlements, invoices, fuel, drivers, brokers) adopt this by supplying a column definition array and a `view_key`.

## Technical notes

- shadcn Popover, Checkbox, Button, Table only; TanStack Query as today.
- Mobile card layout stays curated: Load #, Status, Broker, Driver, Rate (plus any other visible columns kept out of the card to avoid clutter).
- `LoadsListPage` keeps its `onSelectLoad` prop, so the Management Portal entry point and Dispatch routing are unchanged; role gating untouched.
- No changes to `loads`, `load_stops`, `brokers`, or `operators`.
- Existing `loadsRouting` tests re-run, plus coverage for the sort cycle and preference defaults.
