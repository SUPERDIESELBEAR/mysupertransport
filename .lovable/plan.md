

## Auto-Copy Stage 2 Documents to Driver Vault on "Received"

### What it does

When staff marks a Stage 2 document (Form 2290, Truck Title, or Truck Photos) as "Received" in the onboarding status, a database trigger automatically copies the uploaded files from `operator_documents` into `driver_vault_documents` — so they appear in the Driver Vault without any manual re-upload.

Documents already in the vault for that operator and category are skipped (no duplicates). This is additive — staff can still upload documents directly to the vault at any time.

### How it works

A new **database trigger** on the `onboarding_status` table fires `AFTER UPDATE` and checks if `form_2290`, `truck_title`, or `truck_photos` just transitioned to `'received'`. For each transition, it queries `operator_documents` for matching files and inserts them into `driver_vault_documents` with the appropriate category and label mapping:

| Stage 2 field | operator_documents.document_type | Vault category | Vault label |
|---|---|---|---|
| form_2290 | `form_2290` | `form_2290` | IRS Form 2290 |
| truck_title | `truck_title` | `truck_title` | Truck Title |
| truck_photos | `truck_photos` | `truck_photos` | Truck Photos |

The trigger copies `file_url` and `file_name` from the source records. Since both tables use signed URLs from the same `operator-documents` bucket, the vault card's existing signed-URL refresh logic will handle re-signing when needed.

### Backfill for existing operators

A one-time data migration will also copy documents for operators whose Stage 2 docs are already marked "received" but don't yet have vault entries — covering drivers onboarded before this feature.

### Technical details

- Trigger function: `copy_stage2_docs_to_vault()` — `SECURITY DEFINER` to bypass RLS
- Fires on `onboarding_status` `AFTER UPDATE` (same table as the existing `notify_operator_on_status_change` trigger)
- Uses `INSERT ... ON CONFLICT DO NOTHING` pattern (with a check for existing vault entries by operator_id + category + file_name) to prevent duplicates
- Backfill runs as part of the same migration

### Files changed

| File | Change |
|------|--------|
| Migration | Create trigger function `copy_stage2_docs_to_vault()`, attach trigger, run backfill query |

No front-end changes needed — the vault card already displays whatever is in `driver_vault_documents`.

