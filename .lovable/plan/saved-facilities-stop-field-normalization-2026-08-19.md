# Saved Facilities + Stop Field Normalization

Extends the existing Create Load form and adds a reusable Facilities directory. No rebuild of the Create Load form or Loads list.

## 1. Database

New `facilities` table with the specified columns (name, address, city, state, zip, contact name/phone/email, facility type, appointment flag, hours notes, access notes, `times_used`, `last_used_at`, `is_active`, notes, audit columns referencing `profiles(id)`).

- `load_stops` gains a nullable `facility_id` referencing `facilities(id) on delete set null`. Stop address text stays on the stop, so historical loads never change when a facility is edited. Existing rows keep `facility_id = null`.
- RLS via `public.has_role(auth.uid(), ...)`: management, owner, dispatcher, onboarding_staff can select/insert/update; delete restricted to management and owner; operators select only.
- Grants: SELECT/INSERT/UPDATE/DELETE to `authenticated`, ALL to `service_role`, nothing to `anon`.
- Indexes on `facility_name`, `city`, `state`, `is_active`, `times_used`, and `load_stops.facility_id`; unique partial index on `(lower(facility_name), lower(city), state) where is_active`.
- `BEFORE UPDATE` trigger using `public.update_updated_at_column()`.
- A `BEFORE INSERT/UPDATE` trigger stamps `created_by` / `updated_by` from `public.current_profile_id()`, so client inserts never need to resolve a profile id (same pattern as the load fix).

## 2. Normalization helpers — `src/lib/textNormalize.ts`

`toTitleCase`, `normalizeWhitespace`, `normalizeZip`, `normalizePhone`, `formatPhone`, exactly as specified. Title case preserves already-uppercase acronyms of 3 characters or fewer, handles hyphenated names ("Winston-Salem"), and uppercases directional suffixes (N, S, E, W, NE, NW, SE, SW). Unit-tested in `src/lib/__tests__/textNormalize.test.ts`.

Also adds `src/lib/usStates.ts`: 50 states + DC, plus Canadian provinces as a separate group.

## 3. Stop field normalization (`StopsSection.tsx`)

Applied on blur so typing is never disrupted:

- City, Address 1, Address 2, Contact Name — title case + whitespace collapse
- Facility Name — whitespace collapse only (all-caps names preserved)
- Zip — `normalizeZip`, max 10 chars, numeric-mode input
- State — searchable dropdown (Command in a Popover) storing the two-letter code, US states first, Canadian provinces in a second group
- Contact Phone — formatted as `(555) 123-4567` while typing, stored digits-only

## 4. Facility picker on each stop

New `src/components/dispatch/loadForm/FacilitySelect.tsx`, following the `BrokerSelect` pattern, replacing the plain facility name input:

- Search by name or city; most-used facilities first (`times_used desc`), active only
- Selecting fills facility name, address lines, city, state, zip, contact name and phone on that stop and sets `facility_id`
- All filled fields stay editable
- If any auto-filled field is later edited, a subtle inline note appears on the stop ("Differs from saved facility") with an "Update saved facility" action; nothing is written to the facility without that click
- "Add new facility" item in the dropdown opens a dialog (name, address, city, state, zip, contact name, contact phone, type, hours notes, access notes), creates the facility and selects it
- Manual typing with no selection remains supported, leaving `facility_id` null

Stop schema in `loadFormSchema.ts` gains an optional `facility_id`.

## 5. Usage tracking

`create_load_with_stops` is updated to insert `facility_id` on each stop and, in the same transaction, increment `times_used` and set `last_used_at = now()` for each distinct facility referenced.

## 6. Facilities page

`src/pages/dispatch/FacilitiesListPage.tsx` plus `facilitiesColumns.tsx`, reusing `useViewPreferences` (`view_key = 'facilities_list'`), `ColumnVisibilityMenu`, and `SortableTableHead`.

- Always visible: Facility Name, City. Default on: State, Type, Times Used, Last Used, Contact. Available but off: Address, Zip, Phone, Hours Notes, Access Notes.
- Search across name and city; state filter; facility type filter; "Add Facility" button; row click opens an edit dialog (shared with the add dialog).
- Wired into both portals the same way Loads is: a `Facilities` nav item under Dispatch routing to `/dispatch/facilities`, and a `facilities` view in `ManagementPortal`.

## Technical notes

- shadcn Command/Popover/Dialog/Select/Table only; TanStack Query for facility fetching, invalidated after create/update.
- Delete is not exposed in the UI initially; deactivation is done via `is_active` in the edit dialog.
- `loads` table untouched; existing test data untouched; `loadsRouting` tests re-run plus new normalization tests.
