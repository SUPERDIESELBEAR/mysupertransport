

## Driver Document Vault — Personal Documents Section

### What it does

Adds a new "Driver Documents" card to the Driver Hub (Quick View and standard view) positioned directly below the Inspection Binder. This is a filing cabinet for documents that belong to the driver but are not part of the Inspection Binder — things like IRS Form 2290, Truck Photos, Truck Title, receipts, and miscellaneous files.

- Staff can upload, view, download, and delete documents
- Each document can optionally have an expiration date
- Expired / expiring-soon documents show compliance alerts (same thresholds as CDL/Med Cert: expired, ≤30 days warning)
- Operators can view their own documents from their portal (read-only)

### Database

**New table: `driver_vault_documents`**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| operator_id | uuid NOT NULL | References operators.id |
| uploaded_by | uuid | Staff who uploaded |
| category | text NOT NULL | e.g. `form_2290`, `truck_photos`, `truck_title`, `receipt`, `other` |
| label | text NOT NULL | Display name (auto-set from category or custom) |
| file_url | text | Signed URL |
| file_path | text | Storage path for re-signing |
| file_name | text | Original filename |
| expires_at | date | Optional expiration |
| uploaded_at | timestamptz | Default now() |
| notes | text | Optional note |

**RLS policies:**
- Staff can do all operations
- Operators can SELECT their own documents (via operators.user_id = auth.uid())

**Storage:** Uses existing `operator-documents` bucket with a subfolder pattern `{operatorId}/vault/`.

### Front-end changes

**New component: `src/components/drivers/DriverVaultCard.tsx`**
- Collapsible card with upload button
- Table/list of documents: label, filename, expiry badge, actions (view, download, delete)
- Upload flow: select category (dropdown), optional expiry date (DateInput), file picker
- Expiry badges using same color scheme as inspection binder (red expired, amber expiring soon, green valid)
- File preview via existing `FilePreviewModal`

**`src/pages/staff/OperatorDetailPanel.tsx`**
- Import and render `DriverVaultCard` below the Inspection Binder section
- Quick View order: `8` (between Inspection Binder at 7 and Pay Setup shifted to 9)

**`src/pages/operator/OperatorPortal.tsx`**
- Add a "My Documents" section or tab where operators can view (read-only) their vault documents

### Expiry alerts

The existing `check-cert-expiry` edge function can be extended (or a companion cron query added) to also scan `driver_vault_documents` for Form 2290 expirations and alert staff, using the same thresholds and notification patterns already in place.

### Files changed

| File | Change |
|------|--------|
| Migration | Create `driver_vault_documents` table with RLS |
| `src/components/drivers/DriverVaultCard.tsx` | **New** — upload, list, preview, delete driver vault docs |
| `src/pages/staff/OperatorDetailPanel.tsx` | Render DriverVaultCard below Inspection Binder, adjust Quick View order numbers |
| `src/pages/operator/OperatorPortal.tsx` | Add read-only vault documents view for operators |

