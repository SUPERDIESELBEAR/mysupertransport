

## Add Collapse All, Copy Email, and Message Driver to the Header Row

### Problem
The sticky mini-bar (only visible on scroll) has three useful quick-actions — Collapse/Expand All Stages, Copy Email, and Message Driver — that are not available in the always-visible header row at the top of the driver detail panel.

### Solution
Add these three icon buttons to the header action row (next to Place on Hold, Deactivate, Resend Invite, Save Changes) so they're always accessible.

### Layout
The new buttons will be inserted between "Resend Invite" and "Save Changes":

```text
[← Pipeline]  Driver Name / email
       [Place on Hold] [Deactivate] [Resend Invite] [↕ Collapse All] [📋 Copy Email] [💬 Message] [Save Changes]
```

Each button will be an icon-only `Button variant="outline" size="sm"` with a tooltip (matching the existing style), keeping the header compact.

### Details
- **Collapse/Expand All**: Toggles all 7 stage sections collapsed/expanded — same logic already in the sticky bar
- **Copy Email**: Copies `operatorEmail` to clipboard with a checkmark confirmation — same logic already in the sticky bar
- **Message Driver**: Calls `onMessageOperator(operatorUserId)` through `guardedNavigate` — same logic already in the sticky bar

### Files changed
| File | Change |
|------|--------|
| `src/pages/staff/OperatorDetailPanel.tsx` | Add 3 icon buttons to the header action row (~lines 1655–1669) |

