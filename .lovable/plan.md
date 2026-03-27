

## Add "Owner" Role with Account Deletion Authority

### Summary
Add a new `owner` role that sits above Management. Only the owner can permanently delete user accounts. The owner role cannot be assigned or removed by Management users — it can only be set via the bootstrap function.

### What changes

**1. Database migration — add `owner` to the `app_role` enum**
- `ALTER TYPE public.app_role ADD VALUE 'owner';`
- Update the `assign_user_role` and `remove_user_role` functions to block assigning/removing the `owner` role (even by management)
- Update `is_staff` function to include `owner`

**2. Database migration — assign you the `owner` role**
- Insert the `owner` role for your user ID (Omar Tarar's account)
- You'll keep your `management` role too, so all existing management features continue working

**3. New edge function: `delete-user-account`**
- Accepts a `user_id` to delete
- Verifies the caller has the `owner` role
- Cleans up: deletes from `user_roles`, `profiles`, `operators`, `notifications`, `messages`, and related tables
- Calls `supabaseAdmin.auth.admin.deleteUser()` to remove the auth account
- Logs the action to `audit_log`

**4. Update `useAuth.tsx`**
- Add `isOwner` flag (`roles.includes('owner')`)
- Include `owner` in the role priority list (highest priority)
- Owner is also treated as staff and management

**5. Update `StaffDirectory.tsx`**
- Add "Owner" to the role config with a distinct badge style
- Add a **"Delete Account"** button visible only to the owner
- Confirmation dialog requiring the user's name to be typed before deletion
- Prevent the owner from deleting their own account

**6. Update `StaffLayout.tsx`**
- Treat `owner` the same as `management` for navigation access

### Security guardrails
- The `owner` role cannot be granted or revoked through the UI — only via the bootstrap function or direct database access
- The `delete-user-account` edge function checks `owner` role server-side
- Deletion is logged to the audit trail with the deleted user's name and email
- Self-deletion is blocked

### Files changed

| File | Change |
|------|--------|
| Migration SQL | Add `owner` to enum, update security definer functions |
| `supabase/functions/delete-user-account/index.ts` | New edge function for permanent account deletion |
| `supabase/functions/bootstrap-admin/index.ts` | Support assigning `owner` role |
| `src/hooks/useAuth.tsx` | Add `isOwner` flag, update role priority |
| `src/components/management/StaffDirectory.tsx` | Owner badge, delete account button + confirmation |
| `src/components/layouts/StaffLayout.tsx` | Treat `owner` as management for nav |

