## Findings

**Current behavior** (`src/pages/dispatch/DispatchPortal.tsx`):
- Two "Binder" buttons on driver cards (lines 1817–1826 for one layout, 2178–2187 for the other) both call `setBinderTarget({ userId, operatorId, name })`.
- That state opens an in-place `<Sheet>` at line 2397 that renders `<OperatorInspectionBinder>` inline over the Dispatch Board.
- No route change happens — hence "does not navigate anywhere." On mobile especially, the sheet may open behind the mobile keyboard bar or be visually indistinguishable from staying on the page.

**Why the user reports it as "broken":** the button never leaves the Dispatch Board and never lands on the Driver Hub. There's no missing route or undefined ID — the click handler just opens an overlay that doesn't match user expectations.

**Correct destination:** The Driver Hub already renders a per-driver detail view via `OperatorDetailPanel` (in `src/components/drivers/DriverHubView.tsx`, line 247) and that panel already supports a `scrollToInspectionBinder` prop that lands the user directly on the binder section. There is no separate dispatch-specific binder — the Driver Hub binder is the canonical view.

## Recommendation

Replace the in-place Sheet with a real navigation to the Driver Hub, scrolled to the selected driver's Inspection Binder. Preserve the existing Sheet only as a fallback for when DispatchPortal is used standalone (its own `/dispatch` route), where no parent can navigate to a Driver Hub view.

## Plan

1. **`src/components/drivers/DriverHubView.tsx`** — add two new props:
   - `initialSelectedOperatorId?: string`
   - `scrollToBinderOnOpen?: boolean`
   
   On mount / when props change, seed `selectedOperatorId` from `initialSelectedOperatorId`, and forward `scrollToInspectionBinder={scrollToBinderOnOpen}` to the existing `<OperatorDetailPanel>` (line 249).

2. **`src/pages/dispatch/DispatchPortal.tsx`** — add prop:
   - `onOpenDriverBinder?: (operatorId: string, userId: string, name: string) => void`
   
   Both Binder buttons (lines 1820 and 2181): if `onOpenDriverBinder` is provided, call it; otherwise keep the current `setBinderTarget(...)` fallback so the standalone `/dispatch` route still works.

3. **`src/pages/management/ManagementPortal.tsx`** — at the DispatchPortal render (line 1739):
   - Add state `driverHubBinderTarget: { operatorId: string } | null`.
   - Pass `onOpenDriverBinder={(operatorId) => { setDriverHubBinderTarget({ operatorId }); setView('drivers'); }}`.
   - At the DriverHub render (line 1794–1802), pass `initialSelectedOperatorId={driverHubBinderTarget?.operatorId}` and `scrollToBinderOnOpen={!!driverHubBinderTarget}`. Clear the target when `view` changes away from `'drivers'` so a plain sidebar click into Driver Hub doesn't reopen the last driver.

4. **Cleanup:** Leave the existing `binderTarget` Sheet in DispatchPortal untouched (fallback for the standalone route). No changes to the Call, Message, or Edit handlers.

## Verification

1. From Management → Dispatch Board, click **Binder** on three different driver cards. Each click should:
   - Switch the sidebar highlight to **Driver Hub**.
   - Open that specific driver's detail view.
   - Auto-scroll to the Inspection Binder section.
2. Use the OperatorDetailPanel's **Back** button; it should return to Driver Hub (roster), and the sidebar should still show Driver Hub. From there the user can click the sidebar's **Dispatch Board** to return.
3. Confirm on the same driver cards: **Call** still opens `tel:`, **Message** still switches to `dispatch-messages` with the driver preselected, **Edit** still enters inline edit mode.
4. Navigate directly to `/dispatch` (dispatcher-only route). Confirm the Binder button still opens the in-place Sheet fallback (nothing changes there).
5. Sidebar-click **Driver Hub** afterwards — should open the roster (no residual pre-selected driver).
