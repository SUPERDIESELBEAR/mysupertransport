Rearrange the mobile menu action buttons in the driver portal bottom sheet so the most-used action (Refresh) is first and the destructive action (Sign Out) is last.

Current order: Edit Profile / Change Password / Sign Out / Refresh  
Target order: Refresh / Edit Profile / Change Password / Sign Out

### Files to edit
- `src/pages/operator/OperatorPortal.tsx` — move the Refresh `<button>` block above the Edit Profile block and keep the Sign Out block at the bottom of the action row.

No other UI changes. No new dependencies.