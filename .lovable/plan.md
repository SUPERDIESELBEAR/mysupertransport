

## Add Manual SSN Entry to Application Review Drawer

### Summary

When an applicant's SSN is missing (`ssn_encrypted` is null), show a manual entry form in the review drawer so management can type, encrypt, and save it.

### Changes

**`src/components/management/ApplicationReviewDrawer.tsx`**

In the SSN section (around lines 680-714), after the existing "Reveal SSN" / display logic:

1. Add new state variables: `manualSsn` (string), `ssnSaving` (boolean)
2. Add a `saveManualSSN` async function that:
   - Calls the `encrypt-ssn` edge function with the entered SSN
   - Updates the `applications` table: `UPDATE applications SET ssn_encrypted = encrypted WHERE id = app.id`
   - Logs to `audit_log` with action `manual_ssn_entry`
   - On success, sets `ssnValue` to the formatted SSN and shows it as revealed
3. Modify the SSN display section:
   - When `revealSSN` fails with an error indicating no SSN exists (or `ssn_encrypted` is null on the app object), show a manual entry form instead of just an error
   - The form: a masked input field for 9-digit SSN with `(XXX-XX-XXXX)` formatting + a "Save SSN" button
   - Only visible to management users (already implied by drawer access)

### Flow

```text
User clicks "Reveal SSN"
  → decrypt-ssn returns error (no SSN stored)
    → Show "No SSN on file" message + manual entry form
      → User types SSN → clicks Save
        → encrypt-ssn → update applications.ssn_encrypted
          → Show formatted SSN as revealed
```

### Security

- Encryption uses the existing `encrypt-ssn` edge function (server-side, uses `SSN_ENCRYPTION_KEY`)
- Audit log entry created for accountability
- Only accessible to authenticated staff/management who can already open the drawer

### No Database Changes

Uses existing `applications.ssn_encrypted` column and `audit_log` table.

### Files Changed

| File | Change |
|------|--------|
| `src/components/management/ApplicationReviewDrawer.tsx` | Add manual SSN entry UI + save logic when SSN is missing |

