
## Upfront Costs — Standalone Card (Option A)

### What's being built

A new **"Upfront Costs"** card inserted between the top completion summary and the sticky mini-bar section in `OperatorDetailPanel.tsx`. It is always visible in both the Pipeline and Active Drivers views, is staff-only (no operator-facing file is touched), and saves through the existing `handleSave` flow.

---

### Database migration

Add 5 nullable columns to `onboarding_status`:

```sql
ALTER TABLE public.onboarding_status
  ADD COLUMN IF NOT EXISTS cost_mo_registration NUMERIC,
  ADD COLUMN IF NOT EXISTS cost_form_2290 NUMERIC,
  ADD COLUMN IF NOT EXISTS cost_other NUMERIC,
  ADD COLUMN IF NOT EXISTS cost_other_description TEXT,
  ADD COLUMN IF NOT EXISTS cost_notes TEXT;
```

No RLS changes needed — the existing "Staff can update onboarding status" policy already covers these columns.

---

### UI changes — `src/pages/staff/OperatorDetailPanel.tsx`

**1. Type extension** (~line 112 — end of `OnboardingStatus` type):
Add 5 new fields:
```ts
cost_mo_registration: number | null;
cost_form_2290: number | null;
cost_other: number | null;
cost_other_description: string | null;
cost_notes: string | null;
```

**2. New card rendered at line ~1333** — inserted directly after the closing `})()}` of the top completion summary card and before the sticky mini-bar `{(() => {`:

```text
┌────────────────────────────────────────────────┐
│ 💰 Upfront Costs Paid by SUPERTRANSPORT        │  amber-50 bg
│                                                │
│ MO Registration    $ [ __________ ]            │
│ Form 2290          $ [ __________ ]            │
│ Other              $ [ __________ ]            │
│                    Description: [ ___________ ]│  (shown only when Other > 0)
│                                                │
│ Total: $1,250.00                    (read-only)│
│                                                │
│ Cost Notes: [ textarea ]                       │
└────────────────────────────────────────────────┘
```

- Currency inputs: `type="number"` `min="0"` `step="0.01"` with `$` prefix label
- Total line: computed from `(cost_mo_registration ?? 0) + (cost_form_2290 ?? 0) + (cost_other ?? 0)`, only shown when at least one field has a value
- "Other description" text input: only rendered when `cost_other` is a number > 0
- Cost Notes: small `<Textarea>` for free-form context (vendor, date paid, etc.)
- Card style: `bg-amber-50 border-amber-200` to visually distinguish financial data
- All fields update `status` via `setStatus(prev => ({ ...prev, fieldName: value }))` — identical pattern to every other field in the file
- Saves automatically through the existing `handleSave` → `supabase.from('onboarding_status').update(updateData)` call (the new fields are part of `status` and flow through with no extra code)

**3. No changes** to any operator-facing file (`OperatorPortal.tsx`, `OnboardingChecklist.tsx`, `OperatorStatusPage.tsx`, `SmartProgressWidget.tsx`).

---

### Files changed
1. `supabase/migrations/` — new migration with 5 `ADD COLUMN` statements
2. `src/pages/staff/OperatorDetailPanel.tsx` — type update + new Upfront Costs card (~40 lines of JSX inserted at line 1333)
