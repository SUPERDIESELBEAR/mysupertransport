

## Auto-Sync Application Docs to Inspection Binder

### What changes
**Single file**: `supabase/functions/invite-operator/index.ts`

After the operator + onboarding_status creation block (after line 210), add a block that inserts `inspection_documents` rows for any application uploads that exist.

### Logic

```text
if (operatorId && invitedUserId) {
  const docRows = [];
  
  if (app.dl_front_url)
    → { name: 'CDL (Front)', scope: 'per_driver', driver_id: invitedUserId,
        file_url: app.dl_front_url, uploaded_by: callerUser.id,
        expires_at: app.cdl_expiration ?? null }

  if (app.dl_rear_url)
    → { name: 'CDL (Back)', scope: 'per_driver', driver_id: invitedUserId,
        file_url: app.dl_rear_url, uploaded_by: callerUser.id,
        expires_at: app.cdl_expiration ?? null }

  if (app.medical_cert_url)
    → { name: 'Medical Certificate', scope: 'per_driver', driver_id: invitedUserId,
        file_url: app.medical_cert_url, uploaded_by: callerUser.id,
        expires_at: app.medical_cert_expiration ?? null }

  if (docRows.length > 0)
    supabaseAdmin.from('inspection_documents').insert(docRows)
}
```

This runs for both standard approvals and pre-existing operator imports — both paths have the application data and a resolved `operatorId` + `invitedUserId`.

### Why it's safe
- No schema changes needed — `inspection_documents` already accepts arbitrary `name` values and `per_driver` scope
- If a binder doc with the same name already exists for that driver, it just creates another row (harmless; staff can remove duplicates)
- Uses `file_url` from the application (pointing to `application-documents` bucket) — no file copy needed since staff have read access to that bucket

### Files changed
| File | Change |
|------|--------|
| `supabase/functions/invite-operator/index.ts` | Add inspection doc sync block (~10 lines) after line 210 |

