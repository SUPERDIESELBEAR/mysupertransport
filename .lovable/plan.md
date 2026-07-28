Goal: Remove the Demo Accounts toggle from the management dashboard top row while keeping the Demo Accounts feature fully active.

Current state: `ShowDemoToggle` is rendered in the top bar of `StaffLayout.tsx` and controls the `showDemo` boolean used by `demoFilter` across the app. The `DemoAccountsPanel` is accessible from the sidebar under Management > Demo Accounts.

Changes:
1. Remove `ShowDemoToggle` from `StaffLayout.tsx`
   - Delete the import on line 12.
   - Delete the `<ShowDemoToggle />` render call on line 380.
2. Preserve all demo behavior
   - Keep `useShowDemo.tsx` unchanged.
   - Keep all existing `demoFilter` usages throughout driver/pipeline/compliance queries.
   - Keep the `Demo Accounts` sidebar item in `ManagementPortal.tsx` (line 905) and its view route/render (lines 86, 111, 1991–1992).
3. Add a visibility toggle inside `DemoAccountsPanel.tsx`
   - Render `<ShowDemoToggle />` (or the same switch/label pattern) near the page header so staff can still show or hide demo accounts while on the Demo Accounts page.
   - This keeps the control discoverable without occupying the global top bar.

Verification:
- Build the app and confirm no TypeScript errors.
- Open the management dashboard and confirm the top-row toggle is gone.
- Navigate to Management > Demo Accounts and confirm the toggle is present on the page.
- Toggle the switch and verify that demo accounts appear or disappear in the driver roster and other staff views that use `demoFilter`.