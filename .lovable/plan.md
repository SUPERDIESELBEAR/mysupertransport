## Problems

1. **Driver can't reply** — `OperatorMessagesView` sets its own fixed height `calc(100vh - 180px)`, but it's rendered *inside* `OperatorMessagesHub` which already uses that same height minus a tab header (~50px). The nested view overflows the viewport, pushing the `MessageComposer` below the fold. On mobile there's also the bottom nav bar eating additional space, so the composer is never visible.

2. **Staff name shows as "Staff Member"** — The `profiles` table RLS only lets staff view all profiles and lets users view their own. Drivers have **no SELECT policy** for staff profiles, so `first_name`/`last_name` come back null and the code falls back to the literal string `'Staff Member'` (line 120 of `OperatorMessagesView.tsx`).

3. **Subtitle is hardcoded** — Line 314 passes `otherSubtitle="Onboarding Coordinator"` for every staff member regardless of their actual role (`owner`, `management`, `dispatcher`, `onboarding_staff`, etc.).

## Fix

### 1. Composer visibility (frontend only)
- In `src/components/operator/OperatorMessagesView.tsx`, remove the outer wrapper's fixed `calc(100vh - 180px)` height and its border/rounding. Let it be `h-full flex flex-col` and inherit height from its parent (`OperatorMessagesHub` already provides the fixed height + tab layout).
- Result: the tab content correctly bounds the messages panel, `flex-1 overflow-y-auto` for the message list works, and `MessageComposer` (`shrink-0`) stays pinned at the bottom above the mobile nav.

### 2. Show real staff name + role
- Add a security-definer RPC `public.get_staff_contact_info(_user_ids uuid[])` returning `{ user_id, first_name, last_name, avatar_url, primary_role }` for the given IDs, but only for users that actually have a staff role (`is_staff(user_id)` check inside the function). Safe because it only exposes name/avatar/role — nothing sensitive — and only for staff members the driver has messaged.
- Grant EXECUTE to `authenticated`.
- Replace the direct `profiles` query in `loadStaff` with `supabase.rpc('get_staff_contact_info', { _user_ids: staffUserIds })`.
- Extend the `StaffMember` / `Thread` types to include `role: string | null`, map `primary_role` to a human label:
  - `owner` → "Owner"
  - `management` → "Management"
  - `onboarding_staff` → "Onboarding Coordinator"
  - `dispatcher` → "Dispatcher"
  - `safety` → "Safety Advisor" (if present)
  - fallback → "SUPERTRANSPORT Staff"
- Pass that computed label as `otherSubtitle` to `<MessageThread />` instead of the hardcoded string.

### 3. Verify
- Reload driver Messages → Direct tab: staff row shows real name (e.g., "Emma Mueller") and correct role subtitle, and the reply composer is visible at the bottom on both mobile and desktop.

## Files touched
- `src/components/operator/OperatorMessagesView.tsx` — remove nested fixed height, swap profile query for RPC, derive role label, pass real subtitle.
- New migration — `get_staff_contact_info` RPC + GRANT.

No changes to management-side messaging, message table schema, or RLS on `messages`.
