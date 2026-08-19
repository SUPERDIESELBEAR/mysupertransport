# Load Documents & Document Exceptions — Database Foundation

Adds document capture and missing-document exception tracking to the Load Management layer. Database only, no UI. No existing tables are modified.

## New enum types

- `load_document_type` — rate_confirmation, revised_rate_confirmation, bol, pod, scale_ticket, lumper_receipt, detention_documentation, loadout_pickup_inspection, loadout_delivery_inspection, permit, broker_correspondence, other
- `document_upload_channel` — driver_app, email_forward, office_upload, fax_forward, system_generated
- `document_exception_reason` — shipper_did_not_provide, receiver_refused_to_sign, lost_or_damaged, will_be_emailed_later, electronic_bol_no_paper, facility_closed_no_contact, other
- `document_exception_status` — pending, approved, resolved, denied

## New tables

**`load_documents`** — one row per uploaded file tied to a load (and optionally a specific stop). Carries file location, upload channel, GPS capture point for driver-app photos, photo sequence/label and damage flags for LOADOUT inspection sets, and staff verification fields.

**`document_exceptions`** — one row per missing document a driver reports: which document type, the reason, required driver notes, optional eBOL reference number, GPS of the report, and the resolution trail (status, notes, resolver, and a link to the `load_documents` row that eventually satisfied it).

Both use the exact column list, types, defaults, and foreign keys given in the request. FKs to `loads` cascade on delete; FKs to `load_stops`, `profiles`, and `load_documents` set null.

## Security

- RLS enabled on both tables, using the existing `public.has_role()` function.
- Management, owner, dispatcher: full read/write.
- Onboarding staff: read only.
- Operators: can select and insert rows for loads where `loads.operator_id` resolves to their own operator record (`operators.user_id = auth.uid()`). No update or delete after insert.
- Grants: SELECT/INSERT/UPDATE/DELETE to `authenticated`, ALL to `service_role`, no `anon` grant.

## Performance and maintenance

- Indexes: `load_documents(load_id)`, `load_documents(document_type)`, `load_documents(load_stop_id)`, `document_exceptions(load_id)`, `document_exceptions(status)`, `document_exceptions(document_type)`.
- BEFORE UPDATE triggers on both tables calling the existing `public.update_updated_at_column()`.

## Multi-tenant readiness

No composite keys or tenant-derived constraints; tenancy resolves through `load_id` today, so a `company_id` column plus a policy filter can be added later without restructuring.
