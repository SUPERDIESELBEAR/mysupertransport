## Goal

Clean up the Compliance Summary list view and harden the data layer behind it so every consumer (dashboard, cron jobs, audit log) sees the same compliance status. Five workstreams, ordered so each one's value lands independently.

## 1. List view cleanup + remove leading dot next to driver name

File: `src/components/inspection/InspectionComplianceSummary.tsx` (list-view branch only).

- Remove the colored status dot rendered immediately before each **driver name** in list view. Row-level status stays visible via the existing left stripe/tint from `cfg.rowCls`. Fleet rows keep their leading dot (user only asked about drivers).
- Restructure each driver row into a single, scannable block:
  ```text
  [ Driver Name ─────────────────────────  Status pill   ⤴ ]
     │ CDL      Mar 14, 2026     • 87 days
     │ Med Cert May 02, 2026     • 134 days
  ```
  - Sub-rows render as a vertical stack with a faint left guide (`border-l border-border/60 pl-3`), not the current `sm:grid-cols-2` grid.
  - In list-view sub-rows, replace the colored doc-type badge (CDL/Med Cert) with bold muted-foreground text in a fixed-width slot. Keep the small status dot and the per-cert status pill.
  - Date column uses `tabular-nums w-[110px]` so dates align vertically across drivers.
  - Tighten padding to `py-2`, hover changes background only.
- Cards view and fleet rows untouched.

## 2. Server-side compliance status (foundation for everything else)

Create a Postgres **view** `public.v_compliance_items` that the dashboard, cron jobs, and edge functions all read from. Each row is one cert for one entity:

| column            | type    | notes                                                              |
|-------------------|---------|--------------------------------------------------------------------|
| `entity_kind`     | text    | `'driver'` or `'fleet'`                                            |
| `operator_id`     | uuid    | null for fleet rows                                                |
| `operator_name`   | text    | resolved from `applications`                                       |
| `doc_key`         | text    | `'CDL'`, `'Medical Certificate'`, `'Insurance'`, `'IFTA License'`  |
| `inspection_doc_id` | uuid  | fleet rows only                                                    |
| `expires_at`      | date    |                                                                    |
| `days_until`      | int     | `expires_at - (now() AT TIME ZONE 'America/Chicago')::date`        |
| `status`          | text    | `'expired' \| 'critical' \| 'warning' \| 'valid' \| 'missing'`     |

Status thresholds match today's JS rules and accept the warning window via a `compliance_status(days int, window_days int)` SQL function so the dashboard can pass the user's chosen window. The component swaps its `getStatus()` + manual fetch/sort for a single `SELECT ... FROM v_compliance_items` ordered server-side. Anchors to **US Central** per project standard.

## 3. Single source of truth for CDL / Med Cert expiries

Today the component reads from `inspection_documents` and silently falls back to `applications.cdl_expiration` / `medical_cert_expiration`. The view in #2 will read from `inspection_documents` only. To make that safe:

- **Backfill migration**: for every active operator with no per-driver `inspection_documents` row for `CDL (Front)` / `Medical Certificate`, insert one using the value from `applications`. Idempotent (skip rows that already exist).
- **Trigger** `sync_application_expiry_to_binder`: on `UPDATE` of `applications.cdl_expiration` or `medical_cert_expiration`, upsert the matching `inspection_documents` row so legacy code paths that still write to `applications` stay consistent during the transition.
- Application form is untouched — it still writes initial values on submit, the trigger fans out from there.

## 4. Per-cert edit history

Add an `AFTER UPDATE OF expires_at` trigger on `inspection_documents` that writes one `audit_log` row with `entity_type='compliance'`, `entity_id=<inspection_doc_id>`, `entity_label='<DriverName> <DocType>'` or `'Fleet <DocType>'`, and `metadata={ old_expiry, new_expiry, document_type, source: 'trigger' }`. The existing manual `audit_log.insert` in `handleFleetDateChange` is removed to avoid double entries (trigger covers it). Per-driver edits made from the Inspection Binder now also get logged automatically. Surface "Last updated by X, Y ago" as a small line under each sub-row in the Compliance Summary (reads the most recent `audit_log` row for that `inspection_doc_id`).

## 5. Realtime + a11y polish

- **Scoped subscriptions**: replace the two open-ended `*` listeners with filtered ones — `inspection_documents` filtered to `scope=eq.per_driver` plus a second channel for `scope=eq.company_wide` matching the four doc names we care about. Drop the `applications` channel entirely (the trigger in #3 funnels expiry edits through `inspection_documents`).
- **Debounced refetch**: coalesce events fired within 400 ms into a single fetch.
- **A11y**:
  - Add `aria-label` on each row summarising state in words (e.g. `"John Smith — CDL expires in 12 days, critical"`).
  - Pair the colored status dot/stripe with a small Lucide icon that differs by status (Circle, AlertTriangle, AlertOctagon, MinusCircle) so meaning isn't color-only.
  - Bump the icon-only "Open in Inspection Binder" button to `min-h-11 min-w-11` and confirm it has an `aria-label`.

## Out of scope

Overview tab, `ComplianceAlertsPanel`, Document Hub `ComplianceDashboard`, fleet-row layout, Cards-view styling, application form UI, IRP per-driver flow, notification email content.

## Technical notes / order of operations

The DB work in #2, #3, #4 ships as one migration (approved before any code change), so the component refactor in #1 and #5 can read directly from `v_compliance_items` and not have to support both old and new shapes. Migration order in a single transaction:

1. Backfill `inspection_documents` from `applications` (#3).
2. Create `sync_application_expiry_to_binder` trigger (#3).
3. Create `compliance_status(days, window)` SQL function and `v_compliance_items` view (#2). View is `security_invoker=on` so existing RLS on `inspection_documents` / `operators` / `applications` is enforced; `GRANT SELECT ON public.v_compliance_items TO authenticated`.
4. Create `log_inspection_expiry_change` trigger writing to `audit_log` (#4).

Then the component PR: replace fetch/sort/grouping with a single `from('v_compliance_items').select('*')`, drop client-side `getStatus`, drop the manual fleet audit-log insert, swap realtime channels, restyle list view, add a11y.
