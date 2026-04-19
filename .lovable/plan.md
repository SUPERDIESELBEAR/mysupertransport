

The user wants Management and Staff to be able to see what an operator sees in their Settlement Forecast. The simplest, lowest-risk approach is a **read-only mirror** of the operator's forecast view, embedded inside the Operator Detail Panel that staff already use.

Let me check how the Operator Detail Panel is structured and how other operator-portal views are reused (the codebase already has an `embedded` prop pattern per memory).

Key facts from context:
- `mem://arch/component-patterns` documents the `embedded` prop pattern for reusing operator views in staff/management portals
- RLS already allows staff to SELECT all three forecast tables (set up in v1)
- `OperatorDetailPanel.tsx` exists in `src/pages/staff/` and is shared by Staff + Management
- v1 already shipped a `SettlementForecast/index.tsx` component on the operator portal
- "Out of scope (v1): Staff-side editing of operator forecasts" — read-only is the right call

Yes, this is very doable. Read-only is the right scope.

## Plan: Settlement Forecast — Read-Only View for Staff & Management

### What staff/management will see

A new **"Settlement Forecast"** tab inside the existing Operator Detail Panel (the same drawer they use today for Documents, Onboarding, ICA, etc.). Inside that tab, staff see exactly what the operator sees — the same 3 upcoming payday cards, past settlements history, and per-operator pay percentage — but **read-only** (no Add/Edit/Delete buttons, no modals).

```text
Operator Detail Panel
├─ Onboarding
├─ Documents
├─ ICA
├─ Pay Setup
├─ Settlement Forecast   ← NEW
└─ ...
```

Top of the tab shows a small staff-only banner:
> *Viewing as operator — read-only. Operators self-manage these entries.*

### How we'll build it

**Reuse, don't rebuild.** Follow the existing `embedded` prop pattern (per project memory):

1. Add a `readOnly?: boolean` and `operatorId?: string` prop to `SettlementForecast/index.tsx` and to `SettlementCard.tsx`.
2. When `readOnly === true`:
   - Hide all "+ Add load / + Add fuel / + Add advance / Manage Deductions" buttons
   - Hide row-level edit/delete affordances
   - Don't mount the Add/Manage modals
3. When `operatorId` is passed, fetch that operator's data instead of `auth.uid()`'s. RLS already permits staff SELECT, so no migration needed.
4. Wire it into `OperatorDetailPanel.tsx` as a new tab.

### Files to change (small, focused diff)

| File | Change |
|---|---|
| `src/components/operator/SettlementForecast/index.tsx` | Add `readOnly` + `operatorId` props; gate buttons & modals; switch the operator-id source |
| `src/components/operator/SettlementForecast/SettlementCard.tsx` | Accept `readOnly` prop; hide add/edit/delete affordances when true |
| `src/components/operator/SettlementForecast/PastSettlements.tsx` | Accept `readOnly` (already mostly read-only — just suppress any edit links) |
| `src/pages/staff/OperatorDetailPanel.tsx` | Add new "Settlement Forecast" tab that renders `<SettlementForecast operatorId={operator.id} readOnly />` |

No new tables, no new RLS, no new edge functions. Pure UI surfacing of data staff can already query.

### What stays out of scope (matches v1 boundary)

- ❌ Staff cannot add/edit/delete operator loads, fuel, advances, or deductions
- ❌ Staff cannot change the operator's pay percentage from this view (separate future change in Operator Detail Panel)
- ❌ No notifications when operators add forecast data

If staff later need to *edit* on behalf of an operator, that becomes a separate, deliberate change with audit logging — not bundled here.

### After deploying

1. Staff opens any operator from the Pipeline / Driver Hub
2. Clicks the new **Settlement Forecast** tab in the detail panel
3. Sees the same 3 upcoming payday cards + past settlements as the operator, fully read-only
4. Same view works in the Management portal (since Management uses the same Operator Detail Panel)

