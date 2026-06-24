# FMCSA 10-Year Acknowledgment Gate (Step 3 Employment)

Make the 10-year FMCSA requirement impossible to miss and require explicit acknowledgment before the applicant can fill out employers or advance.

## UX

1. **Acknowledgment checkbox** inside the existing amber FMCSA notice at the top of Step 3:
   > ☐ I have read and understand the FMCSA 10-year employment history requirement.
   - Unchecked by default on every new application.
   - Persisted on the application draft so it survives reload / resume.

2. **Gate the employer form** until the box is checked:
   - Employer cards render in a disabled state (inputs disabled, "Add Previous Employer" button disabled).
   - A soft overlay message: "Acknowledge the FMCSA requirement above to begin entering employment history."
   - The "Next" button is blocked at validation with the same message in `stepError`.

3. **Continuous reminder** as the applicant scrolls through employers:
   - The amber notice becomes `sticky top-0` within the Step 3 scroll area once acknowledged, condensed to a single line:
     > "FMCSA: list all employment for the past 10 years — no gaps."
   - Keeps the rule visible while they add each employer, without re-blocking the form.

## Changes

**1. `src/components/application/types.ts`**
- Add `fmcsa_10yr_acknowledged: boolean` to `ApplicationFormData` and default to `false`.

**2. `src/components/application/Step3Employment.tsx`**
- Render the acknowledgment checkbox at the bottom of the amber notice.
- When `!data.fmcsa_10yr_acknowledged`:
  - Disable every employer input, the "Currently employed" toggle, "Remove", and "Add Previous Employer".
  - Render the gate message in place of the employer list interactivity (cards still visible, dimmed).
- When acknowledged: convert the notice container to a condensed sticky banner (single sentence + small ✓ pill).

**3. `src/components/application/utils.ts`**
- In step 3 validation, if `!data.fmcsa_10yr_acknowledged`, set `errs.employers = 'You must acknowledge the FMCSA 10-year requirement to continue'` and return early (before the existing employer-field checks).

**4. Draft persistence**
- `buildPayload` / autosave already JSON-spread `formData`; add `fmcsa_10yr_acknowledged` to the persisted shape via the same path used by other booleans (e.g. `auth_safety_history`). No schema change needed — it's stored alongside other applicant flags on the application row.
- Confirm `applications` table has (or already accepts) a boolean column for this flag; if not, add a migration to add `fmcsa_10yr_acknowledged boolean not null default false` and corresponding GRANTs are unchanged (column-level only).

## Out of scope
- No staff-portal change. The flag is applicant-side only and not surfaced in the review UI.
- No change to the diff/correction whitelist.
