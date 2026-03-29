

## Revamp Employment Section — Array-Based Employers

### Summary
Replace the fixed `employer_1`–`employer_4` columns with a single `employers` JSONB array column. Rebuild the Step 3 UI to show only the first employer by default, with an "Add Previous Employer" button to reveal more. When the user selects "Yes" for additional employers beyond the initial set, new structured employer blocks appear (not a freeform textarea). Position Held and Reason for Leaving become required fields.

### Database Migration

A single migration that:
1. Adds a new `employers` JSONB column (default `'[]'`)
2. Migrates existing data: builds an array from `employer_1`–`employer_4` (skipping nulls/empty)
3. Drops the old `employer_1`, `employer_2`, `employer_3`, `employer_4` columns
4. Drops the `additional_employers` column (no longer needed — extra employers go in the array)

```sql
ALTER TABLE public.applications ADD COLUMN employers jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.applications SET employers = (
  SELECT jsonb_agg(e) FROM (
    SELECT employer_1 AS e WHERE employer_1 IS NOT NULL AND employer_1::text <> '{}'
    UNION ALL SELECT employer_2 WHERE employer_2 IS NOT NULL AND employer_2::text <> '{}'
    UNION ALL SELECT employer_3 WHERE employer_3 IS NOT NULL AND employer_3::text <> '{}'
    UNION ALL SELECT employer_4 WHERE employer_4 IS NOT NULL AND employer_4::text <> '{}'
  ) sub
);

-- Parse any additional_employers text into the array where possible (best-effort)
-- Remaining freeform text will be lost, but existing apps already submitted won't need it

ALTER TABLE public.applications
  DROP COLUMN employer_1,
  DROP COLUMN employer_2,
  DROP COLUMN employer_3,
  DROP COLUMN employer_4,
  DROP COLUMN additional_employers;
```

### Code Changes

#### 1. `src/components/application/types.ts`
- Replace `employer_1`–`employer_4`, `additional_employers`, `has_additional_employers` with `employers: EmployerRecord[]`
- Update `defaultFormData` accordingly (start with one empty employer)

#### 2. `src/components/application/Step3Employment.tsx`
- Show employer blocks dynamically from `data.employers` array
- Only the first block visible by default
- "+ Add Previous Employer" button appends a new empty `EmployerRecord`
- Each block after the first gets a "Remove" button
- Remove the "Enter NA" instructions
- Remove the `has_additional_employers` radio and freeform textarea
- Make Position Held and Reason for Leaving required on each visible employer block
- Keep employment gaps section unchanged

#### 3. `src/components/application/utils.ts`
- **Validation**: require `employers[0]` to have name, position, reason_leaving filled. For all employers in the array, require position and reason_leaving.
- **Payload builder**: send `employers` as the JSONB array instead of individual columns. Remove `additional_employers` and `has_additional_employers`.

#### 4. `src/pages/ApplicationForm.tsx`
- Load `employers` from the database row (it's a JSONB array). Fall back to `[defaultEmployer]` if empty.
- Remove references to `employer_1`–`employer_4` and `additional_employers`.

#### 5. `src/components/management/ApplicationReviewDrawer.tsx`
- Replace the type definition: `employers: Record<string, string>[] | null` instead of `employer_1`–`employer_4`
- Render employer blocks by iterating over the array
- Remove `additional_employers` display

#### 6. `src/components/management/FormsCatalog.tsx`
- Update mock data to use `employers: [...]` array format

### Backward Compatibility
- The migration moves all existing data into the new column before dropping old ones, so no data is lost for submitted applications
- Draft applications in progress will load correctly because the `ApplicationForm` page will read from the new `employers` array

### Files Changed

| File | Change |
|------|--------|
| **Database migration** | Add `employers` JSONB, migrate data, drop old columns |
| `src/components/application/types.ts` | Replace employer fields with `employers: EmployerRecord[]` |
| `src/components/application/Step3Employment.tsx` | Dynamic add/remove employer blocks, required fields, no "NA" text |
| `src/components/application/utils.ts` | Update validation and payload builder |
| `src/pages/ApplicationForm.tsx` | Load/save `employers` array |
| `src/components/management/ApplicationReviewDrawer.tsx` | Render employers from array |
| `src/components/management/FormsCatalog.tsx` | Update mock data |

