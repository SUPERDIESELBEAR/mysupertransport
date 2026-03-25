
## Plan: Require Description Fields When "Yes" Is Selected on Step 5

### What's changing
Two small updates — one in the validation function and one in the UI component.

**1. `src/pages/ApplicationForm.tsx` — validation logic (step 5 block, lines 70–73)**

Add two conditional checks inside the existing `if (step === 5)` block:
- If `dot_accidents === 'yes'` and `dot_accidents_description` is blank → error: "Please describe each accident"
- If `moving_violations === 'yes'` and `moving_violations_description` is blank → error: "Please describe each violation"

**2. `src/components/application/Step5Accidents.tsx` — UI**

- Add `required` and `error` props to both `<FormField>` wrappers that contain the description textareas, so the red asterisk and error message appear when validation fires.

### Technical details

```
// ApplicationForm.tsx — updated step 5 validation
if (step === 5) {
  if (!data.dot_accidents) errs.dot_accidents = 'Please answer this question';
  if (data.dot_accidents === 'yes' && !data.dot_accidents_description?.trim())
    errs.dot_accidents_description = 'Please describe each accident';
  if (!data.moving_violations) errs.moving_violations = 'Please answer this question';
  if (data.moving_violations === 'yes' && !data.moving_violations_description?.trim())
    errs.moving_violations_description = 'Please describe each violation';
}
```

```
// Step5Accidents.tsx — description FormField with required + error
<FormField
  label="Describe each accident..."
  required
  error={errors.dot_accidents_description}
>
```

No database changes, no new files — purely a validation and UI label update.
