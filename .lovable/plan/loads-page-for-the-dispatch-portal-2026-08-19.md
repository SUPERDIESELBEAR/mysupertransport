# Loads page for the Dispatch Portal

Add a "Loads" section to the Dispatch Portal: a searchable, filterable list of loads with status summary tiles, plus a placeholder detail page.

## Navigation

The dispatch portal today switches sections with an internal page state driven by `?page=`. To honor the requested `/dispatch/loads` URL, the portal will also recognize the `/dispatch/loads` and `/dispatch/loads/:id` paths and render the new views inside the existing `StaffLayout` shell (same sidebar, header, and spacing as the other sections). A new sidebar item "Loads" (truck icon) is added under the Operations group, right after Dispatch Board, and navigates to `/dispatch/loads`.

## Loads list page

- Header: title "Loads" plus a top-right "Create Load" button that shows a toast "Load creation coming soon."
- Summary row of small stat cards: Available; Covered / Dispatched; In Transit (in_transit, at_delivery); Delivered (delivered, pod_received, accessorials_approved); Ready to Invoice. Counts come from the same fetched dataset.
- Controls row: search input (matches load number, broker company name, driver name), status dropdown ("All Statuses" + every load_status value), equipment dropdown ("All Equipment" + every equipment_type value). Filters combine with AND. Search is debounced with the existing `useDebouncedValue` hook.
- Table columns: Load #, Status badge, Broker (dash if none), Driver (Unassigned if none), Equipment (display-formatted), Rate (total_load_value, else linehaul_rate, currency, dash if none), Created (short date). Sorted newest first.
- Rows are clickable and go to `/dispatch/loads/:id`.
- Below ~768px the table is replaced by a stacked card list (no horizontal scroll).

### Status badge colors

available neutral; covered/dispatched blue; in_transit/at_delivery amber; delivered/pod_received/accessorials_approved green; ready_to_invoice/invoiced/factored purple; paid/settled/closed muted gray-green; tonu/cancelled red. Implemented as a small status-to-classes map on the shared Badge component using existing semantic tokens.

### States

- Loading: skeleton rows (or skeleton cards on mobile).
- No loads at all: friendly empty state with the "Create Load" button repeated.
- Filters return nothing: distinct message with a "Clear filters" action.
- Query error: inline error message with a retry.

## Technical notes

- New files: `src/pages/dispatch/LoadsListPage.tsx`, `src/pages/dispatch/LoadDetailPlaceholderPage.tsx`, and a small `src/components/dispatch/LoadStatusBadge.tsx` plus a `loadFormat.ts` helper for enum-to-label and currency formatting.
- Data via TanStack React Query and the existing Supabase client, selecting from `loads` with embedded `brokers(company_name)` and `operators(...)` name fields; ordered by `created_at` desc. Detail placeholder fetches just the load number by id.
- Existing RLS already grants dispatcher, management, and owner full read access to `loads`; no policy changes.
- Only shadcn/ui components already in the project (Table, Badge, Input, Select, Button, Card, Skeleton).
- No database tables, columns, or migrations are added or changed; existing pages are only touched to register the nav item and route branch in `DispatchPortal.tsx`.
