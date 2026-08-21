# Brokers Management Page

A reference directory for brokers, modeled directly on the Facilities page and reusing its infrastructure.

## Placement and routing

- Dispatch portal: `/dispatch/brokers`, same route-detection pattern as `/dispatch/facilities`, with a sidebar item "Brokers" placed next to Facilities.
- Management portal: new `brokers` view added to `ManagementView` and `ALLOWED_VIEWS`, sidebar item next to Facilities, rendering the same page component.
- One shared component: `src/pages/dispatch/BrokersListPage.tsx`, imported by both portals — exactly how `FacilitiesListPage` is shared today.

## The list

Uses `useViewPreferences` (`view_key = 'brokers_list'`), `ColumnVisibilityMenu`, and `SortableTableHead`.

- Always visible: Company Name.
- Default visible: MC Number, City, State, Factoring Status, Payment Terms, Loads.
- Available, hidden by default: DOT Number, Contact Name, Contact Email, Contact Phone, Billing Email, Address, Avg Days to Pay, Created.

Loads = number of loads referencing the broker, rendered as a plain right-aligned number. Zero next to a large count is the duplicate/orphan signal.

Controls: search across company name and MC number (debounced, same as Facilities), factoring status filter (approved / not approved / unknown / pending), and active/inactive filter. Desktop table plus a mobile card list, both clickable.

## Editing

Clicking a row opens the existing `BrokerDialog` in edit mode, pre-filled. The dialog gains a `broker` prop: absent = create (today's behavior), present = edit — the same mode-aware approach used for the load form.

Editable fields: company name, MC number, DOT number, primary contact name, phone, email, billing email, address line 1/2, city, state, zip, payment terms, notes, and active status. Create mode keeps its current compact field set so the parse-panel flow is unchanged.

Duplicate detection in edit mode excludes the record being edited, so a broker never flags itself. It still runs against all other records, so renaming one broker into an exact name match of another surfaces the existing warning panel with the "Use existing" / "Create anyway with reason" choices (in edit mode the override reason is recorded to `audit_log` as a rename override).

## Factoring status

Not a plain field. A separate "Change factoring status" action inside the dialog: pick the new status, enter a required reason, confirm. The reason is written to `factoring_status_reason` in the same update, so the existing trigger records a meaningful `broker_factoring_history` row. Unchanged status writes nothing.

## Deletion

No general delete. Retire a broker with the active flag.

Exception: when load count is zero and the viewer is management or owner, the dialog shows a Delete option with a confirmation naming the broker. Any nonzero load count hides it entirely.

## Permissions

Management, owner, dispatcher, and onboarding staff can view and edit — matching existing `brokers` RLS. Operators cannot reach the page: no sidebar entry and no route in the operator portal.

## Tests

New tests under `src/pages/dispatch/__tests__/brokersPage.test.tsx` and additions to `src/lib/__tests__/brokerDuplicates.test.ts`:

- Operators have no route or nav entry for Brokers.
- Editing a broker does not flag itself as a duplicate (self-exclusion by id).
- Renaming a broker into an exact match of another does surface a warning.
- Delete is offered only when load count is zero, and only for management/owner.

## Technical details

- `src/lib/brokers.ts`: `Broker` interface matching the table columns, `fetchBrokers()` selecting all broker fields plus `loads(count)` so the load count comes back in one query.
- `src/hooks/useBrokers.ts`: React Query hook with `BROKERS_QUERY_KEY`, mirroring `useFacilities`.
- `src/pages/dispatch/brokersColumns.tsx`: column defs in the `FacilityColumnDef` shape (`key`, `label`, `locked`, `defaultVisible`, `align`, `sortValue`, `render`), plus `DEFAULT_BROKER_COLUMNS` and `BROKER_COLUMN_TOGGLES`.
- `findDuplicateBrokers` gains an optional `excludeId` so edit mode skips the current row; existing create-mode callers are unaffected.
- Phone display via `formatPhone`, dates via `formatShortDate`, name/phone normalization via `textNormalize` on save, as today.
- No schema changes, no new RLS, no delete policy changes needed (`authenticated` already has DELETE; the management/owner restriction is enforced by the existing table policies plus the UI gate).
