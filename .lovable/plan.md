## File executed Passenger Authorization into Driver Documents vault

Currently the executed PDF is inserted into `operator_documents` as `document_type = 'other'`, which surfaces in the operator documents list but not in the "Driver Documents" card (`DriverVaultCard`) that reads from `driver_vault_documents`.

### Changes

1. **`supabase/functions/finalize-passenger-auth/index.ts`**
   - Alongside the existing `operator_documents` insert, insert a row into `driver_vault_documents`:
     - `operator_id`: row.operator_id
     - `category`: `'passenger_authorization'`
     - `label`: `Passenger Authorization — Unit {unit_number}` (fallback if unit missing)
     - `file_path`: the storage path used in `passenger-auth-executed` bucket
     - `file_name`: `Passenger Authorization — Unit {unit_number}.pdf`
     - `notes`: `Passenger: {passenger_name} ({relationship})`
   - Log and continue on failure (don't fail the whole submission).

2. **`src/components/drivers/DriverVaultCard.tsx`**
   - Add `{ value: 'passenger_authorization', label: 'Passenger Authorization' }` to `CATEGORIES` so the badge/label renders correctly and staff can filter/upload under the same category.
   - Also update the signed-URL resolver: current code re-signs against `operator-documents` bucket. Passenger auth PDFs live in `passenger-auth-executed`. Store bucket per-doc? Simplest: keep vault card bucket assumption, but for `passenger_authorization` category re-sign from `passenger-auth-executed` instead. Small conditional on the two `createSignedUrl` calls in `fetchDocs`.

3. **Backfill (optional)** — via insert tool: create `driver_vault_documents` rows for any existing `passenger_authorizations` where `executed_pdf_url` is set and `operator_id` is not null, so Marcus's just-signed doc appears without re-submission.

### Where the user will see it

In the Driver Hub → open Marcus Mueller → **Driver Documents** card. The PDF appears with a "Passenger Authorization" label, view/download/delete controls, and (for staff) the existing vault UI.

### Not changed

- The `operator_documents` filing stays as a secondary record (used for compliance/audit paths and the `filed_operator_document_id` back-reference).
- No schema changes required — `driver_vault_documents.category` is a free-form text column.
