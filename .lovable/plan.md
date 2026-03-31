

## Ensure Consistent Phone Format `(xxx) xxx-xxxx` App-Wide

### Problem
Phone numbers are stored and displayed inconsistently. Some input fields have auto-formatting masks, others accept raw text. Display-only areas render the raw database value without formatting.

### What's Already Correct
These inputs already auto-format on keystroke:
- Application form (Step1Personal)
- Operator Detail Panel — Contact Card edit mode
- Edit Profile Modal
- Add Driver Modal
- ICA Builder Modal

### What Needs Fixing

**A. Create a shared `formatPhone` utility** in `src/lib/utils.ts`
A single reusable function that formats any phone string (digits or partially formatted) into `(XXX) XXX-XXXX`. Two variants:
- `formatPhoneInput(val)` — for live keystroke masking (progressive formatting)
- `formatPhoneDisplay(val)` — for display-only (formats a stored value for rendering)

**B. Add input formatting to 3 locations:**

| File | Field | Fix |
|------|-------|-----|
| `StaffDirectory.tsx` | `editingPhone` onChange | Add `formatPhoneInput` mask |
| `StaffDirectory.tsx` | `invitePhone` onChange | Add `formatPhoneInput` mask |
| `ContractorPaySetup.tsx` | `phone` onChange | Add `formatPhoneInput` mask |

**C. Add display formatting to 5 locations:**

| File | Line | Current | Fix |
|------|------|---------|-----|
| `PipelineDashboard.tsx` | ~2935 | `{op.phone ?? '—'}` | `{formatPhoneDisplay(op.phone) \|\| '—'}` |
| `OperatorDetailPanel.tsx` | ~2122 | `{applicationData.phone}` | `{formatPhoneDisplay(applicationData.phone)}` |
| `ArchivedDriversView.tsx` | ~339 | `{driver.phone}` | `{formatPhoneDisplay(driver.phone)}` |
| `ContractorPaySetup.tsx` | ~256 | `value: existing?.phone` | `value: formatPhoneDisplay(existing?.phone)` |
| `OperatorDetailPanel.tsx` | ~5044 | `value: ps.phone` | `value: formatPhoneDisplay(ps.phone)` |

### Technical Detail

The shared `formatPhoneDisplay` function:
```ts
export function formatPhoneDisplay(raw: string | null | undefined): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '').slice(0, 10);
  if (digits.length !== 10) return raw; // return as-is if not 10 digits
  return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
}
```

### Files Changed

| File | Change |
|------|--------|
| `src/lib/utils.ts` | Add `formatPhoneInput` and `formatPhoneDisplay` |
| `src/components/management/StaffDirectory.tsx` | Format both phone inputs |
| `src/components/operator/ContractorPaySetup.tsx` | Format phone input + display |
| `src/pages/staff/PipelineDashboard.tsx` | Format phone display |
| `src/pages/staff/OperatorDetailPanel.tsx` | Format phone display (2 spots) |
| `src/components/drivers/ArchivedDriversView.tsx` | Format phone display |

