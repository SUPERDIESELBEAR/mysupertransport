# Notification assignment: staff-only, drivers can receive

## What's happening today

The driver Notifications page and the management Notifications page render the **same component** (`NotificationHistory`). Nothing in it checks role, so:

- Drivers see the Assign / Re-assign buttons and the bulk "Assign" action, which they should not have.
- The assignee picker only lists staff roles (onboarding, dispatcher, management, owner), so staff cannot assign anything to a driver.
- The "Assigned to me" filter is effectively dead for everyone: the database only lets a person read notifications addressed to them (`user_id = me`), so a row assigned to someone else never appears in their list. Today the assignee only gets a separate "X assigned you a notification" pop-up copy.
- "Mark all read" already exists on the driver Notifications page (same shared header), so no new button is needed there — see the note at the end.

Your rule set makes sense and is what will be implemented: staff can assign to staff or drivers; drivers can only be assigned to.

## What will change

**1. Hide assignment controls from drivers**
Gate the per-row Assign/Re-assign button and the bulk Assign action on staff role. Drivers keep read/unread, snooze, archive, search, filters, and the "Assigned to me" tab (now meaningful).

**2. Let staff assign to drivers**
The assignee picker gets two groups/tabs: **Staff** and **Drivers**. The Drivers list shows active operators (name + unit number), searchable the same way. Staff-only; the picker is never opened by a driver.

**3. Make "Assigned to me" actually work**
Add a read rule so a person can also see a notification that is assigned to them, not just ones addressed to them. This is what makes the filter show real work items for both staff and drivers, and it is required for driver assignment to be useful at all.

**4. Server-side enforcement**
The assign function already requires a staff caller. It will additionally validate that the chosen assignee is a real staff member or an active driver, so a crafted request cannot assign to an arbitrary account. Driver assignees get the same in-app pop-up and note; the owner audit copy is unchanged.

## Mark all as read

It is already on the driver Notifications page (top right, appears when there are unread items). What the driver app does *not* have is "Mark all read" inside the bell dropdown — management has that. I will add it to the driver bell dropdown too so the behaviour matches.

## Technical notes

- `NotificationHistory.tsx`: `const { isStaff } = useAuth()` gates `setAssignTarget` buttons (row + bulk toolbar).
- `AssignNotificationModal.tsx`: add a Drivers source — query `operators` (active) joined to profiles for name/unit; keep the existing staff query; tabbed list, single selection across both.
- `assign-notification` edge function: after resolving `assigneeUserId`, verify it has a staff role or an active operator row; else 400.
- Migration: new SELECT policy on `public.notifications` for `authenticated` using `assigned_to = auth.uid()` (existing owner policy stays).
- `NotificationBell.tsx`: driver variant renders the same "Mark all read" action already used on the staff side.