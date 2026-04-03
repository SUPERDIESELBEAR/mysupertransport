

## Operator Preview Mode for Staff

### What it does
Adds an "Operator Preview" sidebar item under **Tools** in the Staff Portal. When clicked, staff can pick any operator from the roster and see a **read-only** rendering of the full Operator Portal exactly as that driver sees it — same progress tracker, tabs, dispatch status, documents, and onboarding stages.

### How it works

**1. Add `previewUserId` prop to `OperatorPortal`**

The portal currently uses `user.id` from `useAuth()` in ~45 places to fetch operator data, messages, notifications, etc. We add an optional `previewUserId?: string` prop. Internally, a single variable `const effectiveUserId = previewUserId ?? user?.id` replaces all `user.id` references for data fetching. When `previewUserId` is set, the component operates in read-only mode — all write operations (ack buttons, signature, uploads, profile edits) are hidden or disabled.

A `readOnly` flag derived from `!!previewUserId` will:
- Hide action buttons (sign ICA, upload docs, ack truck down, send messages)
- Show a persistent banner: "You are previewing [Operator Name]'s portal — read-only"
- Disable realtime subscriptions (not needed for preview)
- Hide modals for password change, profile edit, notification prefs

**2. Add Operator Picker + Preview view in `StaffPortal`**

- New nav item: `{ label: 'Operator Preview', icon: <Eye />, path: 'operator-preview' }` under Tools
- New view state `'operator-preview'` added to `StaffView` type
- When the view loads, show a searchable dropdown/list of all operators (reuse existing operator query pattern from DriverHubView)
- Once an operator is selected, render `<OperatorPortal previewUserId={selectedUserId} />` below the picker
- A "Back" or "Change Operator" button at the top lets staff switch to a different operator

**3. Key data flow**

```text
StaffPortal
  └─ view === 'operator-preview'
       ├─ Operator picker (search by name)
       └─ <OperatorPortal previewUserId="abc-123" />
            └─ effectiveUserId = previewUserId
            └─ readOnly = true (hides writes, shows banner)
```

### Files changed

| File | Change |
|------|--------|
| `src/pages/operator/OperatorPortal.tsx` | Add `previewUserId` prop; derive `effectiveUserId` and `readOnly`; replace ~45 `user.id` refs with `effectiveUserId`; conditionally hide write actions; add read-only banner; skip realtime subscriptions in preview |
| `src/pages/staff/StaffPortal.tsx` | Add `'operator-preview'` to `StaffView`; add nav item with Eye icon under Tools; add operator picker + OperatorPortal render block |
| `src/pages/management/ManagementPortal.tsx` | Same nav item addition (if Management also needs it) |

### Scope note
This is a significant refactor of `OperatorPortal.tsx` (1283 lines, 45 `user.id` references). The changes are mechanical (find-replace with `effectiveUserId`) but numerous, so careful testing is important. No database changes or new tables are needed — it reads existing data through the staff user's RLS permissions.

