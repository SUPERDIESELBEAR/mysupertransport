# Plan: Make PEI Archive Reasons Conditional on Not Hired

## What we will build

Update the **Archive Applicant** dialog in the PEI queue so that:

1. **Hired is the default archive category** and appears first in the radio group.
2. **The reason list is only shown when Not Hired is selected.** When Hired is selected, the reason section is hidden entirely.
3. **Reason is only required when Not Hired is selected.** When Hired is selected, the archive can proceed without a reason.

## UI changes

- `src/components/pei/ArchiveApplicantDialog.tsx`:
  - Reorder the archive category radio group so **Hired** is the top option and **Not Hired** is second.
  - Change the default `category` state from `not_hired` to `hired`.
  - Wrap the reason radio group in a conditional block so it only renders when `category === 'not_hired'`.
  - In `handleArchive()`, only validate the reason when `category === 'not_hired'`. For Hired, pass `null` or an empty string to the API.

## API/database considerations

- The `archiveApplicant()` helper in `src/lib/pei/api.ts` already passes the category. If the `archive_applicant_pei` RPC still requires a reason value, we may need to pass `null` or an empty string for Hired archives. I will verify the RPC signature before implementing.

## Out of scope

- No changes to the existing archive categories (Hired / Not Hired).
- No changes to the archive section split in the PEI queue (Hired / Not Hired sections remain as-is).
- No new audit note or bulk-action behavior beyond what exists.