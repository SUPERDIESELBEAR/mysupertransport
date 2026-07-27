# Plan: Split PEI Archive into Hired / Not Hired Sections

## What we will build

1. **Two archive sections** in the PEI Queue: **Archive (Hired)** and **Archive (Not Hired)**. The existing single "Archived" section will be removed.
2. **Archive classification** when staff archive an applicant: a required "Hired / Not Hired" choice in the archive dialog, separate from the reason.
3. **Header styling** that stands out more: each section gets a colored left stripe and a stronger, taller header with a count pill and hint.
4. **Backfill**: existing archived applicants are placed in **Archive (Not Hired)** by default, since most current archive reasons (withdrew, hired elsewhere, did not onboard) point to not hired.

## Database changes

- Add `pei_archive_category` (`text`) to `public.applications` with values constrained to `hired` and `not_hired`.
- Default any existing `pei_archived_at` rows to `not_hired`.
- Update the `archive_applicant_pei` RPC to accept an `_archive_category` parameter and store it.
- Update the `restore_applicant_pei` RPC to clear the new category on restore.
- Update the `get_pei_queue` RPC to return `pei_archive_category`.

## UI changes

- `src/lib/pei/types.ts`:
  - Add `PEIArchiveCategory` type and `ARCHIVE_CATEGORY_LABEL`.
  - Add `pei_archive_category` to `PEIQueueRow`.
- `src/lib/pei/api.ts`:
  - Update `archiveApplicant()` to accept and send the category.
- `src/components/pei/ArchiveApplicantDialog.tsx`:
  - Add a required "Archive as" radio group: **Hired** / **Not Hired**.
  - Keep the existing reason radio group + Other text field.
- `src/components/pei/PEIQueuePanel.tsx`:
  - Replace single `archived` section with `archived_hired` and `archived_not_hired`.
  - Update `SectionKey`, `SECTIONS`, `sectionFor()`, and grouping logic.
  - Add color-coded left stripe styles to each section header.
  - Update stat tile labels to include the two archive categories.
  - Preserve the archive/restore buttons and archived-by metadata.
- `src/lib/pei/exportCsv.ts`:
  - Add an `Archive Category` column to the CSV export.

## Visual style

Section headers will use a colored left border stripe and a slightly more prominent background. Proposed color mapping:

- Overdue → red/rose stripe
- Pending → slate/neutral stripe
- In Progress → blue stripe
- Completed → emerald stripe
- Archive (Hired) → gold/amber stripe
- Archive (Not Hired) → gray/slate stripe

The exact Tailwind token colors will be chosen from the existing theme without hardcoding hex values.

## Out of scope

- No change to the PEI auto-cadence logic (it already skips archived applicants).
- No new search or filter capabilities beyond what exists; the existing search bar will still match applicant/employer names across both archive sections.
- No changes to the unarchive/restore behavior beyond clearing the new category.