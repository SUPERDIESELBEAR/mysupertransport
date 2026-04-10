

## Add: Send PWA Install Instructions to Individual Operator

### Current State
The `notify-pwa-install` Edge Function sends install notifications to **all** active operators in bulk. There is no way to target a single operator, and no UI button to trigger it.

### Plan

**1. Update the Edge Function** (`supabase/functions/notify-pwa-install/index.ts`)
- Accept an optional `operator_id` in the request body
- When provided, send only to that one operator (skip idempotency check so it can be re-sent)
- When omitted, keep existing bulk behavior unchanged

**2. Add a "Send Install Instructions" button** to the OperatorDetailPanel
- Place it in the operator's profile actions area (near existing action buttons)
- On click, call the Edge Function with the specific `operator_id`
- Show a success/error toast

### Files changed

| File | Change |
|------|--------|
| `supabase/functions/notify-pwa-install/index.ts` | Accept optional `operator_id` body param; when set, query only that operator and skip the idempotency duplicate check |
| `src/pages/staff/OperatorDetailPanel.tsx` | Add a "Send Install Instructions" button that invokes the function for the current operator |

### Detail

**Edge Function change:**
```typescript
const body = await req.json().catch(() => ({}))
const targetOperatorId = body?.operator_id || null

// If targeting one operator, fetch just that one (no idempotency skip)
const query = supabase.from('operators').select('id, user_id, application_id').eq('is_active', true)
if (targetOperatorId) {
  query.eq('id', targetOperatorId)
}
```

**UI button:** A small icon button or menu item labeled "Send Install Instructions" that calls the function and confirms with a toast like "Install instructions sent to [operator name]."

