

## IRS 2290 "Operator Provided" Toggle + Upfront Costs Delete

### What it adds

1. **"Operator Provided Own 2290" toggle** in Stage 2 next to the Form 2290 field — when toggled on, the 2290 can still be uploaded and tracked in Stage 2 (and copied to the vault), but the Form 2290 cost field in the Upfront Costs card is hidden/excluded from the total since SUPERTRANSPORT didn't pay for it.

2. **Delete buttons** on each Upfront Costs attachment (MO Registration, Form 2290, Other) so staff can remove an uploaded receipt.

### Database

**Migration**: Add one boolean column to `onboarding_status`:
```sql
ALTER TABLE public.onboarding_status
  ADD COLUMN form_2290_owner_provided boolean NOT NULL DEFAULT false;
```

No other schema changes needed.

### Frontend changes — `OperatorDetailPanel.tsx`

**1. Type + state**: Add `form_2290_owner_provided: boolean` to the `OnboardingStatus` type and wire it into the initial fetch and save logic.

**2. Stage 2 — Toggle**: Below (or inline with) the Form 2290 status dropdown, add a Switch + label: *"Operator provided own 2290"*. When toggled, it calls `updateStatus('form_2290_owner_provided', true/false)`. This is purely informational for Stage 2 — the upload and "Received" workflow remain unchanged.

**3. Upfront Costs card — Conditional 2290 row**: When `form_2290_owner_provided` is `true`:
- Hide the Form 2290 cost input and its attachment
- Exclude `cost_form_2290` from the running total
- Show a small note: *"Operator provided own IRS 2290 — not a company cost"*

**4. Upfront Costs — Delete attachment**: Add a trash/X button next to each existing attachment link in the `CostAttachment` component. On click:
- Delete the file from `operator-documents` storage
- Delete the row from `operator_documents` table
- Clear local state (`setAttachUrl(null)`, `setAttachName(null)`)
- Show confirmation toast

### Files changed

| File | Change |
|------|--------|
| Migration SQL | Add `form_2290_owner_provided` boolean column |
| `src/pages/staff/OperatorDetailPanel.tsx` | Add toggle in Stage 2, conditionally hide 2290 cost row, add delete to CostAttachment |

