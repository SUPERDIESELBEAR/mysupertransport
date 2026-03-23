
## Structured Additional Insured & Certificate Holder Fields — ✅ COMPLETE

### What was built
All insurance structured-field work is fully implemented and verified end-to-end.

### Changes delivered

**1. Database migration** ✅
- Replaced old `insurance_additional_insured` / `insurance_cert_holder` text columns with 12 structured columns (`insurance_ai_company`, `insurance_ai_address`, `insurance_ai_city`, `insurance_ai_state`, `insurance_ai_zip`, `insurance_ai_email` + CH equivalents).
- Added `insurance_ch_same_as_ai` boolean column (default `false`) so the "Same as Additional Insured" checkbox state persists across reloads rather than being inferred from matching field values.

**2. `OperatorDetailPanel.tsx`** ✅
- Updated `OnboardingStatus` type with all 12 structured fields + `insurance_ch_same_as_ai`.
- Replaced flat inputs with two collapsible cards (Additional Insured, Certificate Holder), collapsed by default.
- "Same as AI" checkbox copies all 6 AI fields into CH fields and disables CH inputs while checked.
- Checkbox state saved to `insurance_ch_same_as_ai` in DB; loaded on panel open via `setChSameAsAI(os.insurance_ch_same_as_ai ?? false)`.
- Green filled-state indicator dots on each collapsed header when company name is present.
- Small note under each email field: *"Included in email to insurance company so they can send a copy"*.

**3. `send-insurance-request` Edge Function** ✅
- Updated `select` query to fetch all 12 structured columns.
- `buildInsuranceEmail` formats structured address blocks (Company, address line, city/state/zip, email as mailto link).
- Certificate Holder section shows "Same as Additional Insured" label when fields are identical.

### Verification
- End-to-end browser test confirmed: enter AI data → green dot appears → check Same as AI → CH dot + company name appear → Save → reload → checkbox still checked, both headers populated. ✅
