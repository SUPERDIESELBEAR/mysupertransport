## `from('table' as any)` cluster cleanup

All 17 distinct tables behind these casts (`applications`, `audit_log`, `carrier_signature_settings`, `contractor_pay_setup`, `dispatch_status_history`, `driver_optional_docs`, `faq_history`, `ica_contracts`, `ica_driver_acknowledgments`, `inspection_binder_order`, `insurance_email_settings`, `lease_terminations`, `onboarding_status`, `operators`, `pei_request_events`, `pei_requests`, `truck_owners`) are **already present** in `src/integrations/supabase/types.ts`. No regeneration needed — the casts are stale leftovers from before the types were updated. Removing them gives us end-to-end type safety on these calls for free.

### Scope

85 occurrences of `.from('<table>' as any)` across 10 files:

- `src/pages/staff/OperatorDetailPanel.tsx` (23)
- `src/pages/staff/PipelineDashboard.tsx` (3)
- `src/pages/dispatch/DispatchPortal.tsx` (4)
- `src/pages/operator/OperatorPortal.tsx` (3)
- `src/pages/management/TerminationsView.tsx` (1)
- `src/components/operator/OperatorICASign.tsx` (3)
- `src/hooks/useBinderOrder.ts` (2)
- `src/hooks/useDriverOptionalDocs.ts` (3)
- `src/lib/truckSync.ts` (1)
- `src/lib/pei/api.ts` (2)

### Approach (per file, one pass)

1. Drop the `'<table>' as any` cast on every `.from()` call.
2. Run `tsgo --noEmit` after each file. Any new errors will fall into one of three buckets:
   - **`(data as any)?.field` downstream reads** — replace the cast with the real row type (or simply drop the `as any` since the query now returns a typed row).
   - **`.insert(...)` / `.update(...)` payloads missing required columns** — narrow the cast to *just* the payload (e.g. `.insert(payload as never)` is wrong; instead build a typed `TablesInsert<'x'>` object, or keep a tight `as Database['public']['Tables']['x']['Insert']` cast only on the payload).
   - **Filters / `.eq()` arg type mismatches** — usually means the value is `string | null`; add an early `if (!id) return;` guard or `.eq('col', id!)`.
3. No behavior changes — pure type tightening. Where a column genuinely isn't in types (none expected, but if it appears), the file gets a narrowly-scoped cast on that single field, not the whole table.

### What stays out of scope

- The remaining `as any` sites that are NOT `from('table' as any)` (RPC casts, third-party SDK shims, edge-function payloads) — separate follow-up.
- Schema or RLS changes — strictly client-side type hygiene.
- Behavior changes, refactors, or UI changes.

### How you'll verify

- `tsgo --noEmit` is green at the end of the pass.
- Smoke-test paths that touch the most-cast file (`OperatorDetailPanel`):
  - Open any operator row from `/dashboard?view=staff` → pay setup, ICA history, dispatch status changes, insurance email, audit-log entries still load.
- Spot-check dispatcher: `/dispatch` → change a driver's dispatch status → row appears in history.
- Spot-check operator: ICA signing flow still saves (`OperatorICASign`), binder order persists (`useBinderOrder`), optional docs render (`useDriverOptionalDocs`).

### Files touched

The 10 listed above only. No new files, no deletions.
