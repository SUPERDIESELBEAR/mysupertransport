## Goal

Add audit trail events from the operator ICA signing screen so we can see exactly where future signing issues occur.

## Events to log

All on `audit_log` with `entity_type='ica_contract'`, `entity_id=operator_id`, `entity_label=operator full name`:

| Action | When |
|---|---|
| `ica_screen_opened` | `OperatorICASign` mounts and a contract loads |
| `ica_execute_clicked` | User taps **Execute Agreement** (after client-side guards pass) |
| `ica_upload_failed` | Storage upload or `ica_contracts` update throws — include `stage` (`storage_upload` / `contract_update` / `status_update`) and `error_message` |
| `ica_signed` | Existing success event — keep as-is |

Each entry's `metadata` includes `contract_id`, `operator_id`, and event-specific fields (e.g. `error_message`, `error_code`, `stage`, `user_agent`).

## Why an RPC

`audit_log` INSERT policy is `is_staff(auth.uid())`, so the current operator-side insert silently fails (it's wrapped in try/catch). Add a `SECURITY DEFINER` RPC `public.log_ica_event(p_action text, p_operator_id uuid, p_contract_id uuid, p_metadata jsonb)` that:

- Verifies `auth.uid()` matches the operator's `user_id` (or caller is staff).
- Validates `p_action` is in an allowlist of the four ICA events above.
- Inserts the row with the operator's name as `actor_name`.

Granted `EXECUTE` to `authenticated`.

## Client changes

`src/components/operator/OperatorICASign.tsx`:

- After contract loads in `fetchContract`, call the RPC with `ica_screen_opened` (guarded by a ref so it only fires once per mount/contract).
- At the top of `handleSign`, call `ica_execute_clicked`.
- Replace the existing direct `audit_log` insert at success with the RPC call for `ica_signed` (so it actually succeeds for operators).
- In the `catch` block, call the RPC with `ica_upload_failed` and the stage + error details before showing the toast.

Add a tiny helper `logIcaEvent(action, metadata)` local to the file to keep call sites short, and pass `navigator.userAgent` plus `window.location.href` once.

## Out of scope

- No UI changes, no copy changes, no behaviour changes beyond logging.
- Staff-side ICA signing/builder is not touched.
