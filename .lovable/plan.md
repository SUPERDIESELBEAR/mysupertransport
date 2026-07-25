## Diagnosis

The OSAS email failure is still the same backend role-check issue. The deployed function is trying to allow a role named `admin`, but this app’s role list does not include `admin`, so the database rejects the role filter before the email can be sent.

## Plan

1. **Fix the shared staff auth helper**
   - Remove the invalid `admin` role from the shared staff role type/defaults.
   - Ensure role checks only use valid app roles: owner, management, onboarding staff, dispatcher, etc.
   - This prevents future email functions from repeating this exact enum error.

2. **Fix the OSAS send function**
   - Update the OSAS function’s allowed roles to remove `admin`.
   - Keep owner, management, and onboarding staff access for sending sign-off sheets.

3. **Improve the visible error message**
   - Confirm the frontend reads the JSON error envelope when the function returns a non-2xx response.
   - If it still only shows “Edge Function returned a non-2xx status code,” update the OSAS modal toast to show the backend’s readable error details.

4. **Deploy and verify**
   - Deploy the touched email function(s).
   - Re-check function logs and make a direct test call with the authenticated preview session if possible.
   - Confirm the old `invalid input value for enum app_role: "admin"` error no longer appears.