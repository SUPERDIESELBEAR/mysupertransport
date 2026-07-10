
## Goal

Let staff manually add a Previous Employer PEI record for applicants like Ryan Martinez who predate the in-app application flow — then send, track, and document those PEIs exactly like auto-built ones.

## Where this lives

The PEI tab (`src/components/pei/ApplicationPEITab.tsx`) already handles sending, follow-ups, GFE, and status tracking. Today it only gets rows via **Auto-build from employment history**, which reads `applications.employers`. Legacy applicants have no employment history to auto-build from, so the tab shows the empty state and there is no way to add one manually.

## Option A — Recommended: "Add Previous Employer" button on the PEI tab

Add a second button next to **Auto-build**, labeled **+ Add Previous Employer**. It opens a small modal with the exact fields we already send and track:

- Employer name *(required)*
- Contact name *(optional)*
- Contact email *(required to send; can be filled later)* — with the same **Find with AI** button used elsewhere
- City *(required)*
- State *(required, US_STATES dropdown)*
- Employment start date *(optional, MM/YYYY)*
- Employment end date *(optional, MM/YYYY, blank = present)*
- DOT-regulated toggle *(default on)*

On save, insert one row into `pei_requests` with `status = 'pending'`, and set `applications.pei_deadline` to today + 30 days if it isn't already set. From that point the row behaves like any other: Send, follow-up, final notice, GFE, delete, response viewer — all existing code paths already handle it.

**Why this is the right fit**
- Zero changes to auto-build, send, tracking, or GFE logic.
- Staff can add one employer or many, in any order.
- Works for any legacy applicant, not just Ryan — anyone whose `employers` JSONB is empty or incomplete.
- The Edit contact / Find with AI / Send / GFE controls on each row already cover follow-up edits.

## Option B — Backfill `applications.employers` first, then Auto-build

Add a UI to edit the applicant's employer list on the application itself, then rely on the existing Auto-build. Heavier: it requires an application-editing surface and re-runs the 3-year / DOT-regulated filter, which can silently skip employers staff intentionally want investigated. Not recommended.

## Option C — Bulk paste

A textarea where staff paste "Name, City, State, Email" lines and we create many rows at once. Useful only if the owner regularly onboards batches of legacy drivers. Can be added later on top of Option A.

## Recommendation

Ship **Option A** now. It is the smallest change that fully solves Ryan's case and any future legacy driver, and it reuses every piece of the existing PEI pipeline.

## Technical notes (for the build step)

- New component: `src/components/pei/AddPreviousEmployerModal.tsx` (Dialog with the fields above, reuses `US_STATES`, `toTitleCase`, and `lookupEmployerEmail`).
- `ApplicationPEITab.tsx`: add the button + modal state; on submit, `supabase.from('pei_requests').insert({...})` then `reload()`.
- If `applications.pei_deadline` is null, set it to today + 30 days in the same save (mirrors `autoBuildPEIRequests`).
- No schema changes. No RLS changes — existing `pei_requests` policies already permit staff inserts.
