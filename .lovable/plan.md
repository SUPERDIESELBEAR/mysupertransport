## Issue

`autoBuildPEIRequests` reports "No DOT-regulated employment in preceding 3 years" for Jose Guzman even though his application lists 3 employers, all marked as CMV positions.

## Root cause

The application form stores employer entries with these field names (confirmed against Jose's row in `applications.employers`):

- `name` (employer name)
- `cmv_position`: `'yes'` / `'no'`
- `start_date` / `end_date` as `MM/YYYY` or the literal string `Present`

But `src/lib/pei/api.ts` → `autoBuildPEIRequests` filters with:

```ts
if (!e || e.is_dot_regulated !== true) return false;
```

No employer record has an `is_dot_regulated` field, so every entry is filtered out and the function falls through to the auto-GFE branch. The same mismatch affects the row mapping (`company_name || employer_name` never matches the actual `name` field).

## Fix (single file: `src/lib/pei/api.ts`)

1. **DOT-regulated detection** — treat an employer as DOT-regulated when any of the following is true:
   - `e.is_dot_regulated === true` (future-proof)
   - `e.cmv_position === 'yes'` (current application form value)

2. **Employer name fallback** — extend the name resolution to include `e.name`:
   ```ts
   String(e.company_name || e.employer_name || e.name || 'Previous Employer').trim()
   ```

3. **Handle `end_date: 'Present'`** — `parseEmployerDate` already returns `null` for unrecognized strings, and the existing `if (!end) return true` keeps current employers in scope, so no change needed there. (Optional polish: explicitly recognize `present`/`current` and treat as today so the row's `employment_end_date` is left null instead of accidentally parsed.)

4. **Address/contact field mapping** — application form stores `email` (not `contact_email`) and has no `contact_name`, `phone`, `address`, `zip` fields. Existing code already falls back to `e.email`, so contact email will populate. Other fields will simply be null, which is acceptable — staff can fill them in before sending.

## Out of scope

- No schema changes, no migrations.
- No UI changes to `ApplicationPEITab.tsx` or `PEIQueuePanel.tsx`.
- No changes to the application form itself.

## Verification

1. Open Jose Guzman's application → PEI tab → click "Auto-build from employment history".
2. Expect 3 PEI request rows created (Haynes Company LLC, Pinch Intermodal, New England Motor Freight Inc), all with `status: pending`, not a single GFE row.
3. Confirm employer names, cities, states, and start/end dates populate on the rows; `employer_contact_email` populates where the applicant supplied one.
4. Re-test on an applicant whose employers are all `cmv_position: 'no'` — should still produce the auto-GFE "not_dot_regulated" row.
