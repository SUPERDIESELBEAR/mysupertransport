

## Add Input Masks for Phone and Employment Dates

### Summary
The phone number field in Step 1 and the employment date fields in Step 3 lack auto-formatting. This plan adds input masks so values are always formatted consistently.

### What will change

#### 1. Phone number auto-format — Step 1
Add an `onChange` handler that strips non-digits and formats as `(XXX) XXX-XXXX` as the user types. Same pattern already used elsewhere in the app (Edit Profile, ICA Builder, Add Driver modal per project memory).

**File:** `src/components/application/Step1Personal.tsx`
- Wrap the phone `onChange` with a formatter that strips non-digits and inserts `(`, `)`, space, and `-` at the correct positions.

#### 2. Employment date auto-format — Step 3
Add an `onChange` handler for start/end date fields that auto-inserts a `/` after the month digits, enforcing `MM/YYYY` format.

**File:** `src/components/application/Step3Employment.tsx`
- Create a `formatMonthYear` helper that strips non-digits, caps at 6 chars, and inserts `/` after position 2.
- Apply it to both the Start Date and End Date inputs (skipping End Date when value is "Present").
- Add `maxLength={7}` to both inputs.

### Files changed

| File | Change |
|------|--------|
| `src/components/application/Step1Personal.tsx` | Add phone formatter on `onChange` |
| `src/components/application/Step3Employment.tsx` | Add `formatMonthYear` helper; apply to start/end date inputs |

### Notes
- The DOB and CDL Expiration fields already use `type="date"` (native browser picker with built-in slash formatting) — no changes needed.
- No database or backend changes required.

