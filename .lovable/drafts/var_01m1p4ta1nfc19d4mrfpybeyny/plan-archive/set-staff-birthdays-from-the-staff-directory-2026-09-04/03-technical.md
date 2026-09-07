## Technical notes

No schema change needed: `public.profiles.birth_month` / `birth_day` already exist and are used by the self-service `EditProfileModal` and `useStaffBirthdayAnniversaryEvents`.

- `supabase/functions/get-staff-list/index.ts`
  - Add `birth_month, birth_day` to the profile `select` in the list handler (line ~423) and to the mapped `staff` object.
  - New `action === 'update_birthday'`: validate `birth_month` in 1-12 and `birth_day` in 1-31 (or both null to clear), reject a day beyond the month's max, write both columns with `supabaseAdmin`, then insert an `audit_log` row (`action: 'birthday_updated'`, `entity_type: 'staff_profile'`) mirroring the `update_phone` block. Keep the existing caller staff-role authorization gate — no new privilege path.
- `src/components/management/staff-directory/types.ts`: add `birth_month?: number | null; birth_day?: number | null` to `StaffMember`.
- `src/components/management/staff-directory/StaffMemberPanel.tsx`: add a Birthday row modeled on the existing phone inline-edit (local state, edit toggle, saving spinner, `onMemberChange` optimistic update) using two shadcn `Select`s; day options derived from month. Include a Clear action that sends nulls.
- Reuse the month-name/day-count helper from `EditProfileModal.tsx`; if it is inline there, lift it to `src/lib/birthdayAnniversary/` and import in both so the two forms cannot drift.

RLS is unaffected — the edge function uses the service role behind its own staff check, matching how name/phone/email edits already work.

## Verification

Set a birthday for another staff member from the directory, reload and confirm it persists and shows formatted; clear it and confirm it returns to "No birthday on file"; confirm the activity log records the change; confirm the self-service Edit Profile still reads and writes the same value.
