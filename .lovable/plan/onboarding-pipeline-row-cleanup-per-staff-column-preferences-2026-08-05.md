# Onboarding Pipeline — Row Cleanup & Per-Staff Column Preferences

## 1. Clean up the pills on each applicant row

Today the name line carries up to five pills: completion `%`, the onboarding **Day** pill, the **PEI** status pill, a mobile unread-messages badge, and a document-count badge. Underneath sits the **App Installed** / **Send App Install** pill.

Changes:
- Remove the `%`, PEI, unread-count, and document-count pills from the name line. The name stands alone (still clickable, still sortable from the header).
- Move the **Day** pill down onto the same line as **App Installed** / **Send App Install**, sitting directly to its right.

Yes — this is cleaner. The name line becomes a single scannable column of names, and the second line becomes a consistent "status strip" (day count + app state) with the same height on every row, so rows stop jumping when one applicant happens to have more badges than another.

Nothing is lost: completion % still shows in the Progress Track column and is still sortable from the header; unread messages remain in the Msgs column; PEI status remains reachable from the PEI Queue and the applicant detail panel.

## 2. Per-staff hideable columns

Add a **Columns** button in the pipeline toolbar (next to the existing filter controls). It opens a checklist where each staff member toggles which optional columns they want to see:

- Phone
- State
- Start Date
- Coordinator
- Msgs
- CDL / Med Cert (compliance)
- Last Activity

Name and Progress Track stay always-on (they are the spine of the table). A "Reset to defaults" link restores all columns.

The selection is saved **per staff member**, not globally — changing your own view never affects anyone else's dashboard. Preferences follow the staff member across devices (saved to their account, not just the browser).

## Technical notes

- `src/pages/staff/PipelineDashboard.tsx`: strip the four pills from the name `<td>`; render `OnboardingDaysPill` inside the existing `op.user_id` block, wrapped with the App Installed pill in a `flex items-center gap-1.5 flex-wrap` row.
- New table `public.staff_ui_preferences` (`user_id uuid pk`, `prefs jsonb default '{}'`, `updated_at`), with `GRANT SELECT, INSERT, UPDATE ... TO authenticated`, `GRANT ALL ... TO service_role`, RLS enabled and policies scoped to `auth.uid() = user_id`.
- New hook `src/hooks/useStaffUiPreferences.ts`: reads prefs on mount, seeds from a `localStorage` cache for instant first paint, writes back debounced.
- New component `src/components/staff/PipelineColumnPicker.tsx`: popover + checkbox list driven by a `PIPELINE_COLUMNS` config array (key, label, default visibility, existing responsive class).
- Each optional `<th>`/`<td>` pair renders conditionally on `visible.has(key)`; existing `hidden md:/lg:/xl:table-cell` classes are kept so small screens still auto-collapse.
- Column keys stored under `prefs.pipelineColumns`, leaving room for future per-staff view settings in the same row.