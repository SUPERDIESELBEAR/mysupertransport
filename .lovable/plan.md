## Problem

On the driver-facing Equipment Asset Sheet, tapping **Execute** shows "Something went wrong while saving your signature. Please try again." Two backend guards block the driver flow:

1. **Storage RLS blocks the upload.** The signature is uploaded to `operator-documents/equipment-asset-sheet/<operatorId>/signature-*.png`. The `Operators can upload operator docs` policy requires the **first** folder segment to equal the driver's own operator id. Because the path starts with `equipment-asset-sheet`, the INSERT is denied for every driver.

2. **DB trigger blocks the row update.** `enforce_onboarding_status_operator_column_whitelist` only lets operators write `decal_photo_ds_url`, `decal_photo_ps_url`, `updated_at`, and the `ica_status → complete` transition. Writing `eld_signature_typed_name` / `eld_signature_image_url` raises `operator cannot modify column …`, even though the sibling trigger `enforce_onboarding_status_operator_update` was already updated to permit those columns.

Both must be fixed for a driver to complete the receipt acknowledgment. Staff previews work today only because `is_staff()` short-circuits the trigger; the upload still fails via the staff-wide storage policy which is why Emma sees the same toast.

## Fix

### 1. Storage path (frontend)
`src/components/equipment/EquipmentAssetSheet.tsx`, `handleExecute` (~line 174): change

```
const path = `equipment-asset-sheet/${operatorId}/signature-${Date.now()}.png`;
```

to

```
const path = `${operatorId}/equipment-asset-sheet/signature-${Date.now()}.png`;
```

so `foldername[1] = operatorId` and the existing `Operators can upload operator docs` / `Operators can view their operator docs folder` policies grant access. No new bucket policy needed. No prior successful uploads exist under the old prefix (upload always failed), so no data migration is required.

### 2. Column whitelist trigger (migration)
Update `public.enforce_onboarding_status_operator_column_whitelist` so the `v_allowed` array also includes:

- `eld_signature_typed_name`
- `eld_signature_image_url`
- `eld_signature_signed_at`

`eld_signature_signed_at` stays server-controlled because the `enforce_eld_signature_lock` trigger overwrites `NEW.eld_signature_signed_at` from `OLD` and only sets `now()` itself once name+image are present — the whitelist entry just prevents it from tripping the "operator cannot modify column" check when the BEFORE trigger stamps the timestamp.

No other trigger, RLS policy, or client code needs to change. The lock trigger already prevents drivers from re-signing after `eld_signature_signed_at` is set.

## Out of scope

- No changes to the equipment single-pill work from the previous turn.
- No changes to management/staff flows, receipts uploads, or storage bucket policies.
- No backfill; nothing was successfully written under the broken path.
