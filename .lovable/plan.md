## Goal
On the forward-facing operator (driver) portal, remove the standalone **Change Password** key-icon button from the top header bar. Keep the **Change Password** option (with key icon) inside the mobile hamburger menu.

## Current State
In `src/pages/operator/OperatorPortal.tsx`, the header top-right area (lines ~951-997) contains a row of icon buttons:
1. Profile avatar → Edit Profile
2. **KeyRound icon → Change Password** ← REMOVE THIS
3. SlidersHorizontal → Notification preferences
4. NotificationBell
5. LogOut (desktop only)
6. Hamburger (mobile only)

Inside the mobile hamburger dropdown (lines ~1001+), there is already a **"Change Password"** row with the `KeyRound` icon. This stays.

## Change
- In `src/pages/operator/OperatorPortal.tsx`, delete the `<button>` wrapping the `<KeyRound>` icon in the header icon row (lines 969-975). This removes the redundant standalone key icon from the top bar on both desktop and mobile.
- The existing Change Password option inside the mobile hamburger menu remains untouched.
- No auth, routing, or data logic changes.

## Verification
After the change, open the operator portal preview at mobile width. Confirm:
- The key icon is no longer visible in the main header next to the profile avatar and notification bell.
- Tapping the hamburger menu still shows "Change Password" with the key icon.
- Desktop header also no longer shows the standalone key icon.