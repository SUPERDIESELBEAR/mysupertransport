## Fix: ICA "Execute Agreement" surfaces raw RLS error to driver

### Root cause

Tapping **Execute Agreement** runs `UPDATE ica_contracts SET status='fully_executed', contractor_signed_at=…`. That fires the `AFTER UPDATE` trigger `sync_ica_completion_to_onboarding`, which cascades an `UPDATE onboarding_status SET ica_status='complete'`. Although the sync trigger is `SECURITY DEFINER`, `auth.uid()` is still the driver, so the `BEFORE UPDATE` enforcement triggers on `onboarding_status` block the cascade with:

> Operators may only update their own decal photos, truck_photos, and ica_status

That raw Postgres message is then rendered straight into the driver's toast. A redundant explicit `UPDATE onboarding_status SET ica_status='complete'` from the client (lines 206–213 of `OperatorICASign.tsx`) compounds the risk.

### Changes

**1. DB migration — `app.ica_sync_cascade` session-local bypass**

- Recreate `public.sync_ica_completion_to_onboarding()` so it wraps the inner `UPDATE onboarding_status` with `set_config('app.ica_sync_cascade', '1', true)` before and `set_config('app.ica_sync_cascade', '', true)` after. The `true` makes it transaction-scoped, so it can't leak to other sessions.
- Recreate `public.enforce_onboarding_status_operator_update()` and `public.enforce_onboarding_status_operator_column_whitelist()` so that, immediately after the `is_staff` short-circuit, they check:
  ```sql
  IF current_setting('app.ica_sync_cascade', true) = '1' THEN
    RETURN NEW;
  END IF;
  ```
  All other logic is preserved verbatim.

Scope is narrow: the bypass only flips during the single `UPDATE onboarding_status` that the sync trigger itself issues. Any operator-initiated update from the app, API, or another trigger path still goes through the existing enforcement.

**2. `src/components/operator/OperatorICASign.tsx`**

- Delete the redundant `supabase.from('onboarding_status').update({ ica_status: 'complete', ... })` block (currently ~lines 206–213). The DB trigger is now the single source of truth for that flip.
- In the catch block, keep the existing `logIcaEvent('ica_upload_failed', { error: err?.message, ... })` so staff retain the raw diagnostic. Replace the driver-facing toast with:
  > "Something went wrong while saving your signature. Please try again, and contact support if the issue persists."

**3. `public/version.json`**

- Bump `version` to force installed PWAs to pick up the new client immediately.

### Verification (run all four before closing)

1. **End-to-end as Emma Mueller** — open the pending ICA (`fca18922-3810-4b8c-bedb-3e15f1f44297`) in the operator portal, draw signature, type name, tap **Execute Agreement**. Confirm the success toast appears (no raw RLS text) and the UI flips to "Signed on: …".
2. **SQL spot-check**:
   ```sql
   SELECT status, contractor_signed_at
     FROM ica_contracts
     WHERE id = 'fca18922-3810-4b8c-bedb-3e15f1f44297';

   SELECT ica_status
     FROM onboarding_status
     WHERE operator_id = 'c49e2427-11cf-4765-a48b-36b28cd150a2';
   ```
   Expect `status = 'fully_executed'`, `contractor_signed_at` populated, `ica_status = 'complete'`.
3. **Regression — bypass is not a wide hole** — simulate a driver UPDATE on `onboarding_status` from a path that is NOT the sync trigger (e.g. attempt to set a non-whitelisted column via the client). Confirm the enforcement trigger still raises and the write is rejected. Confirms `current_setting('app.ica_sync_cascade', true)` is only `'1'` inside the trigger.
4. **Forced error path** — temporarily induce a failure (e.g. revoke storage access to `ica-signatures` for a single test, or stub a 500 from `execute-ica`). Confirm the driver sees the friendly toast, the raw error string never reaches the UI, and `logIcaEvent('ica_upload_failed', ...)` still records `err.message` for staff.

### Files touched

- New migration: `supabase/migrations/<timestamp>_ica_sync_cascade_bypass.sql`
- `src/components/operator/OperatorICASign.tsx`
- `public/version.json`
