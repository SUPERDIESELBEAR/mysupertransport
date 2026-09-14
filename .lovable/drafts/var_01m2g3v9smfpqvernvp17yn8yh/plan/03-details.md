## Background Verification panel

- PSP Status sits between MVR Status and Clearinghouse Status, same three options, same Save button.
- The notice becomes: all three of MVR, PSP and Clearinghouse must be Received before the application can be approved.
- The Approve & Invite gate now requires all three, and keeps the existing rule that it reads *saved* values, not unsaved dropdowns.
- The panel gains a small "Interview notes (2)" line linking to the same notes log, so the drawer and the list show one record, not two.

## Suggestions worth taking

1. **Stamp request and receive dates for PSP**, as MVR and Clearinghouse already do on the onboarding record. Free to add now, painful to backfill later, and it is what answers "when did we pull this?" during an audit.
2. **Confirmed: no historical gating.** The requirement applies only when Approve & Invite is pressed on an application that is not yet approved. Already-approved applications and everyone already onboarded stay untouched — no re-blocking, no retroactive PSP demand.
3. **Log the changes.** Status changes and note edits/deletes write to the activity log with the staff member's name, the same as other application actions.
4. **One filter, not four.** Rather than three status filters, add a single "Verification" filter with Complete / In progress / Not started, computed from the three checks. Keeps the toolbar clean.
5. **Notes are staff-only.** Applicants never see them, and they stay out of the applicant PDF and any shared packet.

## Technical notes

- **Staged schema (applies when this draft is accepted):**
  - `applications.psp_status` reusing the existing `mvr_status` enum (`not_started` / `requested` / `received`), default `not_started`, not null — no new enum type.
  - `onboarding_status.psp_status`, `psp_requested_date`, `psp_received_date`, mirroring the MVR columns.
  - New `application_interview_notes`: `application_id` FK, `author_id`, `author_name`, `body`, `created_at`, `updated_at`, `edited_at`. GRANTs then RLS: insert/select for onboarding_staff, management, owner via `has_role`; update limited to the author or management; delete management/owner only. No applicant or anon access.
- `supabase/functions/invite-operator/index.ts` copies `psp_status` into `onboarding_status` alongside the existing MVR/CH copy.
- `src/components/management/ApplicationReviewDrawer.tsx`: add `bgPspStatus` state seeded and re-seeded like the others, include it in the dirty check, extend `bgVerificationComplete` and the tooltip, save it with the section.
- `src/pages/management/ManagementPortal.tsx` applications view: extend the 12-column grid to Applicant 3 / Contact 2 / Submitted 1 / Checks 2 / Interviews 1 / Status 2 / Action 1, add per-row expansion state, and wire `ColumnVisibilityMenu` with `useStaffUiPreferences`. Mobile cards get the three chips and a notes count; expansion is drawer-first on mobile.
- New `src/components/management/InterviewNotesPanel.tsx` used by both the expanded row and the drawer, plus a chips component shared by list and drawer so the two never drift.
- Because the new column and table only exist once the draft is accepted, the notes panel and PSP field cannot be exercised in the preview until then.
