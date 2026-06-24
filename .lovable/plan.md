# Make Employer Email Required (Step 3 Employment)

Employer email is currently optional. Make it a required field with an asterisk and block step progression until a valid email is provided for every listed employer.

## Changes

**1. `src/components/application/Step3Employment.tsx`**
- Change the Employer Email `FormField` label from `"Employer Email (optional, helps speed up verification)"` to `"Employer Email"` with `required` prop (renders the asterisk).
- Update helper/placeholder copy to indicate it's needed for employment verification.

**2. `src/components/application/utils.ts` (step 3 validation, lines 45–73)**
- For the current/last employer (`emp0`): require `email` is non-empty and matches a basic email regex. Error message: `"Employer email is required for the current employer"` / `"Enter a valid employer email for the current employer"`.
- For each additional employer with a `name` filled in: same email + format check, with index-specific error message.
- Reuse the same `errs.employers` field used by other employer errors so it surfaces in the existing error spot beneath the list.

**3. `src/components/application/types.ts`**
- No type change needed (`email?: string` stays; runtime validation enforces it). Optional: drop the `?` for clarity — will do, since it's now always required.

## Out of scope
- No backend/schema change. `applications.employers` is JSONB; existing rows with missing emails are unaffected.
- No change to the staff-side ProposeChangesDrawer (employer block already shows email when present).
