
## Structured Additional Insured & Certificate Holder Fields

### What the user clarified
The AI and CH email address fields are informational only — they appear in the insurance request email sent to the insurance company so they know where to send copies. The app itself never emails the AI or CH directly.

### Current state
The database and code still use the original single-text columns (`insurance_additional_insured`, `insurance_cert_holder`). The structured-field migration from the previous plan conversation was designed but never executed.

### Changes needed

**1. Database migration**
Replace the two old text columns with 12 structured columns:
```sql
ALTER TABLE public.onboarding_status
  DROP COLUMN IF EXISTS insurance_additional_insured,
  DROP COLUMN IF EXISTS insurance_cert_holder,
  ADD COLUMN insurance_ai_company TEXT,
  ADD COLUMN insurance_ai_address TEXT,
  ADD COLUMN insurance_ai_city    TEXT,
  ADD COLUMN insurance_ai_state   TEXT,
  ADD COLUMN insurance_ai_zip     TEXT,
  ADD COLUMN insurance_ai_email   TEXT,
  ADD COLUMN insurance_ch_company TEXT,
  ADD COLUMN insurance_ch_address TEXT,
  ADD COLUMN insurance_ch_city    TEXT,
  ADD COLUMN insurance_ch_state   TEXT,
  ADD COLUMN insurance_ch_zip     TEXT,
  ADD COLUMN insurance_ch_email   TEXT;
```

**2. `OperatorDetailPanel.tsx` — Type + UI**
- Remove the two old fields from `OnboardingStatus` type; add 12 new fields
- Replace the two flat `Input` fields in Stage 6 with two structured cards:

```
┌─ ADDITIONAL INSURED (if truck is financed) ──────────────────┐
│  Company Name      [_________________________________]        │
│  Address           [_________________________________]        │
│  City / State / ZIP [____________] [__] [_______]            │
│  Email (for cert copy) [__________________________]          │
└──────────────────────────────────────────────────────────────┘

┌─ CERTIFICATE HOLDER ────────────────────────────────────────┐
│  [✓ Same as Additional Insured]  (checkbox shortcut)         │
│  Company Name / Address / City / State / ZIP / Email         │
└─────────────────────────────────────────────────────────────┘
```

- "Same as Additional Insured" checkbox copies all 6 AI fields into CH fields instantly and disables the CH inputs while checked
- A small note under each email field: *"Included in email to insurance company so they can send a copy"*
- Save payload uses existing `status` spread — all 12 columns included automatically

**3. `send-insurance-request` Edge Function**
- Update the `select` query to fetch the 12 new columns
- Update `buildInsuranceEmail` to format structured address blocks:
  - Additional Insured section: Company, full address line, email as a mailto link
  - Certificate Holder section: same format (or "Same as Additional Insured" label if identical)
- Remove the old `additionalInsured`/`certHolder` string params; replace with structured objects

### Files changed
| File | Change |
|---|---|
| DB migration | Replace 2 old text cols with 12 structured cols |
| `OperatorDetailPanel.tsx` | Update type + replace flat inputs with structured cards + "Same as AI" checkbox |
| `send-insurance-request/index.ts` | Update select + email HTML to use structured address blocks |
