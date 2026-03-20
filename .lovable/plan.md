
## Reorder Management Portal Sidebar + Add Missing Nav Items

The user provided this exact order for the Management Portal's left nav:
1. Overview
2. Applications
3. Pipeline
4. Messages
5. Notifications
6. Compliance
7. Drivers
8. Inspection Binder
9. Doc Hub
10. Service Library
11. Resources
12. Staff
13. FAQ Manager
14. Pipeline Config
15. Activity

**Current state:**
- Current Management Portal navItems has 14 items in a different order
- "Messages" and "Compliance" are **missing** from Management Portal entirely — they exist only in `StaffPortal.tsx` with full working components (`MessagesView`, `ComplianceAlertsPanel`, etc.)
- "Dispatch" is currently in Management Portal but NOT in the user's requested list — it will be removed from the nav (the view code can remain in case it's referenced elsewhere)

**Changes needed — one file only: `src/pages/management/ManagementPortal.tsx`**

### 1. Add "messages" and "compliance" to the `ManagementView` type (line 59)
Add `'messages'` and `'compliance'` to the union type string.

### 2. Add missing imports
- `MessagesView` from `@/components/staff/MessagesView`
- `ComplianceAlertsPanel` from `@/components/inspection/ComplianceAlertsPanel`
- `InspectionComplianceSummary` from `@/components/inspection/InspectionComplianceSummary`
- `BulkMessageModal` from `@/components/staff/BulkMessageModal`
- Icons: `MessageSquare`, `ShieldCheck` (already partially imported — verify)

### 3. Add state variables for messages + compliance
- `unreadCount` for messages badge (with realtime subscription, same pattern as StaffPortal)
- `criticalExpiryCount` already exists for compliance badge

### 4. Reorder `navItems` array (lines 595–610)
Replace with the exact user-specified order, adding Messages and Compliance entries, removing Dispatch:

```
Overview, Applications, Pipeline, Messages, Notifications,
Compliance, Drivers, Inspection Binder, Doc Hub, Service Library,
Resources, Staff, FAQ Manager, Pipeline Config, Activity
```

### 5. Add view render blocks for `messages` and `compliance`
Mirror the same JSX patterns from `StaffPortal.tsx`:
- `view === 'messages'` → renders `<MessagesView>` with BulkMessageModal toolbar
- `view === 'compliance'` → renders the compliance stat cards + `<ComplianceAlertsPanel>` (same JSX that already exists in StaffPortal)

### Technical details
- The `ManagementView` type string union and the `searchParams` validator on line 89 both need `'messages'` and `'compliance'` added
- Dispatch nav entry removed but `'dispatch'` view logic stays intact (it may be referenced by deep links)
- No database changes needed — this is purely a UI wiring change
- The compliance state variables (`criticalExpiryCount`, `complianceSummary`, etc.) already exist in ManagementPortal — only the nav entry and render block are missing
