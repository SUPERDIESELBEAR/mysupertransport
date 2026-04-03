

## Provision Full Operator Stack for marcsmueller@gmail.com

### Problem
Your test account (`marcsmueller@gmail.com`, user ID `7e356f94-...`) has a profile and an `operator` role, but is missing:
- An **application** record (required to create an operator)
- An **operator** record (required for ICA, onboarding, and all portal features)
- An **onboarding_status** record (required for the onboarding checklist and ICA tab)

Without these, the Operator Portal loads but has nothing to show -- no ICA tab, no onboarding checklist, no document uploads.

### Solution
Update the `create-test-operator` edge function to insert the three missing records using the service role key (bypasses RLS), then call it once:

1. **Insert an `applications` row** -- minimal approved application (review_status = `approved`, first_name = "Marcus", last_name = "Mueller (Test)", email = `marcsmueller@gmail.com`)
2. **Insert an `operators` row** -- linking user_id and application_id, `is_active = true`
3. **Insert an `onboarding_status` row** -- linked to the new operator, `ica_status = 'not_issued'` so you can send an ICA from Management

### After the fix
1. The edge function runs once and provisions all three records
2. From your Management Portal (`marc@mysupertransport.com`), send an ICA to "Marcus Mueller (Test)"
3. On your phone (`marcsmueller@gmail.com`), the ICA will appear in the Operator Portal ready to sign

### Files changed

| File | Change |
|------|--------|
| `supabase/functions/create-test-operator/index.ts` | Replace the password-reset-only logic with full provisioning: insert application, operator, and onboarding_status records for user `7e356f94-ce4a-47aa-8883-0e6b01d09aab` |

### Important
The ICA you previously sent was linked to your owner account's operator record, not this test account. You will need to send a **new** ICA to this test operator once the records are created.

