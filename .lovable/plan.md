
## Stage 8: Contractor Pay Setup

### Overview
Add a new Stage 8 "Contractor Pay Setup" to the operator onboarding pipeline. The operator fills in their payroll details and acknowledges the payroll terms via a toggle. Staff can see the submitted data in the Operator Detail Panel. A dedicated `contractor_pay_setup` table stores the data.

---

### Database (migration required)

**New table: `public.contractor_pay_setup`**
```sql
CREATE TABLE public.contractor_pay_setup (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id         uuid NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
  contractor_type     text NOT NULL,          -- 'individual' | 'business'
  legal_first_name    text NOT NULL,
  legal_last_name     text NOT NULL,
  business_name       text,                   -- required if contractor_type = 'business'
  phone               text NOT NULL,
  email               text NOT NULL,
  terms_accepted      boolean NOT NULL DEFAULT false,
  terms_accepted_at   timestamp with time zone,
  submitted_at        timestamp with time zone,
  updated_at          timestamp with time zone NOT NULL DEFAULT now(),
  created_at          timestamp with time zone NOT NULL DEFAULT now()
);
```

RLS policies:
- Operators can `INSERT` / `UPDATE` / `SELECT` their own record (via `operators.user_id = auth.uid()`)
- Staff can `SELECT` / `UPDATE` all records (`is_staff()`)

---

### New component: `src/components/operator/ContractorPaySetup.tsx`

Self-contained form component (mirrors the ICASign pattern). Contains:

1. **Payroll Instructions section** — static rich content block you will provide the copy for. Styled as an info card at the top of the form (collapsible or always visible).

2. **Contractor Type** — radio toggle: "Individual" / "Business"

3. **Legal Name fields** — First Name, Last Name

4. **Business Name field** — shown only when "Business" is selected

5. **Phone + Email fields** — pre-populated from `profiles` table but editable

6. **Terms & Conditions toggle** — `Switch` component with label: *"I have read and understood the payroll terms and conditions."* Must be `true` to submit.

7. **Submit button** — disabled until all required fields filled + toggle on. On submit: upserts `contractor_pay_setup` row, sets `submitted_at`.

8. **Read-only "submitted" state** — after submission, shows a confirmation card (same pattern as completed ICA). Staff can still see all values in the detail panel.

---

### Operator Portal changes (`src/pages/operator/OperatorPortal.tsx`)

1. **Add `'pay-setup'` to `OperatorView` union type**

2. **Stage 8 status logic** in `getStageStatus(8)`:
   - `'complete'` → `submitted_at IS NOT NULL && terms_accepted = true`
   - `'action_required'` → form is open but incomplete (in_progress)
   - `'not_started'` → no row yet

3. **Stage 8 definition** added to `stages` array:
   ```ts
   {
     number: 8, title: 'Contractor Pay Setup',
     description: 'Set up your payroll account information',
     icon: <CreditCard className="h-4 w-4" />,
     status: getStageStatus(8),
     substeps: [{ label: 'Pay Setup', value: paySetupStatus?.submitted_at ? 'Submitted' : 'Pending', status: ... }],
     hint: 'Complete your payroll details so we can set up your contractor account.',
   }
   ```

4. **Fetch `contractor_pay_setup`** row alongside `onboarding_status` in `fetchData()`, store in state.

5. **New nav item** `{ view: 'pay-setup', label: 'Pay Setup', icon: <CreditCard /> }` — shown to all operators (no `showIf` gate, always accessible).

6. **Render `<ContractorPaySetup />` in the view switcher** when `view === 'pay-setup'`.

7. **`progressPct` update** — stages.length now includes Stage 8 in denominator automatically.

---

### Onboarding Checklist changes (`src/components/operator/OnboardingChecklist.tsx`)

1. Add `CreditCard` to the `STAGE_HEADER_ICONS` map for stage 8.
2. Add a CTA button in `StageCard` for `stage.number === 8` with `action_required` or `not_started` status → navigates to `'pay-setup'` view.

---

### Staff Detail Panel changes (`src/pages/staff/OperatorDetailPanel.tsx`)

Add a read-only **"Stage 8 — Contractor Pay Setup"** section (collapsible, same card style as other stages) showing:
- Contractor Type
- Legal Name (and Business Name if applicable)
- Phone / Email
- Terms Accepted (yes/no + timestamp)
- Submitted at timestamp

Staff do **not** edit this form — it's operator-submitted data only.

---

### Payroll Instructions Content

You mentioned you will provide the content. The `ContractorPaySetup` component will have a clearly marked placeholder section (`{/* PAYROLL_INSTRUCTIONS_CONTENT */}`) that I'll build as a styled card ready for your copy and any document uploads.

---

### Files to create / modify

| Action | File |
|--------|------|
| Create | `src/components/operator/ContractorPaySetup.tsx` |
| Modify | `src/pages/operator/OperatorPortal.tsx` |
| Modify | `src/components/operator/OnboardingChecklist.tsx` |
| Modify | `src/pages/staff/OperatorDetailPanel.tsx` |
| Create | Migration SQL |

No edge functions or new storage buckets required. No changes to existing onboarding_status table.
