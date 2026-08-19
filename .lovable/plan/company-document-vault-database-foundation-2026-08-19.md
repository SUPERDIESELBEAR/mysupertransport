# Company Document Vault — Database Foundation

Database-only change. No UI, no edits to existing tables.

## What gets created

**company_document_category** enum — `authority_registration`, `tax_financial`, `insurance`, `operating`, `contract_template`, `company_policy`, `other`.

**company_documents** — the vault itself: document name, category, description, file location and type, expiration date, version tracking (version number, current-version flag, superseded-by pointer), a sendable flag for quick external sends, notes, and created/updated attribution.

**document_send_log** — a record of every external send: which document, optional broker, recipient email and name, subject and message body, send timestamp, sender, status (`sent` / `failed` / `bounced`), and notes.

## Access rules

- Management and owner: full read/write on both tables.
- Dispatcher and onboarding staff: read-only on company documents (they can view and send, not upload or modify); read and insert on the send log so their sends are recorded.
- Operators: no access to either table.

## Automatic behavior

- `updated_at` stays current on company documents.
- Uploading a document with the same name as an existing current version automatically retires the old one: the older row is marked not-current and pointed at the new row, and the new row's version number increments. Staff always grab the current version.

## Technical details

Order per table: `CREATE TABLE` -> `GRANT` -> `ENABLE ROW LEVEL SECURITY` -> policies.

- Columns exactly as specified. `created_by` / `updated_by` / `sent_by` reference `public.profiles(id)`; `superseded_by_id` self-references `public.company_documents(id) ON DELETE SET NULL`; `company_document_id` references `public.company_documents(id) ON DELETE CASCADE`; `broker_id` references `public.brokers(id) ON DELETE SET NULL`.
- Grants: `SELECT, INSERT, UPDATE, DELETE` to `authenticated`; `ALL` to `service_role`. No `anon` grant.
- Policies use the existing `public.has_role(auth.uid(), 'role')` security-definer function.
- Indexes: `company_documents(category)`, `company_documents(is_current_version)`, `company_documents(expiration_date)`, `document_send_log(company_document_id)`, `document_send_log(broker_id)`, `document_send_log(sent_at)`.
- `BEFORE UPDATE` trigger on `company_documents` calling `public.update_updated_at_column()`.
- Versioning implemented as two `SECURITY DEFINER` functions with `search_path = public`, since the new row's id is needed to set `superseded_by_id`:
  - `BEFORE INSERT`: sets `new.version_number` to `max(version_number) + 1` across rows with the same `document_name` (defaults to 1 when none), and `is_current_version = true`.
  - `AFTER INSERT`: sets `is_current_version = false` and `superseded_by_id = new.id` on prior rows with the same `document_name` that were current.
  - Both functions have `EXECUTE` revoked from `public`, `anon`, and `authenticated`, matching the broker trigger functions.
- No `CHECK` constraints on time-dependent values; `send_status` stays plain text as specified.

Multi-tenant readiness: no cross-table assumptions block adding a `company_id` column later. Version matching is by `document_name` only today; when tenancy activates, that match and the RLS predicates gain a `company_id` filter without restructuring.
