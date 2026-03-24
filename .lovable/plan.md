
## Demo Mode for Both Staff Portal and Management Portal

### What's being built

A `DemoModeContext` flag system that works across both portals. When active, staff and management users can freely explore every view and click every button — all write operations are silently blocked with an informative toast. A persistent amber banner makes demo mode unmistakable and provides a one-click exit.

---

### Architecture

```text
src/hooks/useDemoMode.tsx          — context + sessionStorage persistence
src/components/layouts/StaffLayout.tsx  — amber banner when isDemo is true
src/pages/staff/StaffPortal.tsx    — "Demo Mode" nav item under Tools
src/pages/management/ManagementPortal.tsx — "Demo Mode" nav item under Admin
```

Write-guard pattern (same in both portals):
```text
if (isDemo) {
  toast({ title: "Demo Mode", description: "Changes are not saved in demo mode." });
  return;
}
```

---

### Files to change

**1. `src/hooks/useDemoMode.tsx` (new file)**
- React context with `{ isDemo, enterDemo, exitDemo }`
- State stored in `sessionStorage` — auto-clears when the browser tab closes

**2. `src/App.tsx`**
- Wrap the app with `<DemoModeProvider>` so both portals share the same demo state

**3. `src/components/layouts/StaffLayout.tsx`**
- Accept optional `isDemo` and `onExitDemo` props
- Render an amber banner at the top of main content when `isDemo === true`: `"Demo Mode — read-only. No changes will be saved."` + [Exit Demo] button

**4. `src/pages/staff/StaffPortal.tsx`**
- Add `GraduationCap` nav item with label `"Demo Mode"` under the **Tools** divider section
- When clicked: call `enterDemo()` and show a toast explaining the mode
- Pass `isDemo` and `onExitDemo` down to `StaffLayout`
- Guard write operations in: stage saves, cert reminders, message sends, bulk messages, document/upload actions

**5. `src/pages/management/ManagementPortal.tsx`**
- Same `GraduationCap` nav item added under the **Admin** divider
- Same `enterDemo()` trigger + toast on click
- Pass `isDemo` and `onExitDemo` down to `StaffLayout`
- Guard write operations in: staff directory actions, pipeline config saves, activity-log-triggering saves, bulk message sends, ICA actions, equipment assign/return, dispatch status updates

**6. Key child components — write guards added**
Components where `isDemo` prop is threaded through and blocks mutations:
- `OperatorDetailPanel` — stage saves, notes, cert reminder sends
- `MessagesView` / `BulkMessageModal` — send message
- `DocumentEditorModal` / `DocumentHub` — save, upload
- `EquipmentAssignModal` / `EquipmentReturnModal` — assign/return
- `ICABuilderModal` — send ICA
- `InspectionBinderAdmin` — save changes
- `StaffDirectory` (Management only) — invite/remove staff
- `PipelineConfigEditor` (Management only) — save config

---

### Demo Mode UX

| State | What the user sees |
|---|---|
| Enters demo | Toast: "Demo Mode active — all changes are blocked. Browse freely." |
| Tries a write action | Toast: "Demo Mode — this action is disabled. Exit demo to make real changes." |
| Banner | Amber strip: "⚠ Demo Mode — read-only" + [Exit Demo] button (always visible) |
| Exits demo | Toast: "Demo mode off" — banner disappears, all actions restored |

---

### No database changes required. No new routes. Purely a UI-layer guard.
