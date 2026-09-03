# Fix “These are different devices”

## Confirmed cause

The database table and staff policies are available, but the dismissal insert sends `auth.users.id` into `dismissed_by`, whose foreign key points to `profiles.id`. The live database confirms all 170 profiles use different values for those two IDs, so every populated `dismissed_by` value currently violates the foreign key. No dismissal rows have been stored.

## Plan

1. Update both dismissal write paths—the button action and legacy browser-state migration—to use the signed-in staff member’s `profiles.id`.
2. Keep attribution intact rather than dropping `dismissed_by`; the shared dismissal remains attributable and visible to all permitted staff.
3. Add focused regression tests that verify the inserted payload uses the profile ID, never the auth user ID, and that a successful dismissal hides the conflict.
4. Exercise the real Onboard Systems action and refresh the page to confirm the decision persists.

No database migration is needed because the live grants, RLS policies, foreign key, and table shape are already correct.