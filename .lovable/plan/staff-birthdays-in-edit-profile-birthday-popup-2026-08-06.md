# Staff Birthdays in Edit Profile + Birthday Popup

## What changes

**Edit Profile (staff only)** gets a new **Birthday** section with two dropdowns: Month and Day (no year). It is optional and can be cleared. The driver version of the popup is untouched.

**Birthday popup**: staff birthdays appear in the same top-right celebration popup that already shows driver birthdays and anniversaries — same card, same avatar, same Send button, same dismiss/minimize behavior. Staff cards mix in with driver cards and sort the same way (today first, then upcoming).

- Early-warning behavior matches drivers: the card appears ahead of a weekend/holiday exactly like driver birthdays do today.
- Every staff member sees other staff members' birthdays. A person does not see their own card. Drivers never see staff birthdays.
- Staff get birthdays only (no work anniversary), since there is no staff hire date.
- **Send** opens the same compose modal with the birthday template pre-filled; sending emails the staff member and posts an in-app notification, exactly as it does for drivers.

## Technical notes

- Migration: add `birth_month smallint` and `birth_day smallint` to `public.profiles` (nullable, CHECK 1-12 / 1-31). Existing RLS and grants on `profiles` cover reads/writes.
  - Staff need to read each other's birth month/day. Confirm the existing `profiles` SELECT policies allow staff-to-staff reads; if they do not, add a policy limited to staff roles via `has_role`.
- Migration: relax `staff_event_acknowledgments` so staff-subject events can be acknowledged — make `operator_id` nullable, add `subject_user_id uuid` (FK `auth.users`), add a CHECK requiring exactly one of the two, and add a matching unique index on `(user_id, subject_user_id, event_type, event_date)`.
- `src/hooks/useAuth.tsx`: include `birth_month`/`birth_day` in the profile select and `Profile` type.
- `src/components/EditProfileModal.tsx`: month/day selects rendered only when `allowInternational` is true (the existing staff-only flag passed by `StaffLayout`), saved in the single `profiles` update. Day list adapts to the selected month (max 29/30/31).
- `src/hooks/useStaffBirthdayAnniversaryEvents.ts`: after building operator events, fetch active staff profiles that have a birthday set (joined to `user_roles` for staff roles), build birthday events keyed by `subjectUserId`, skip the current user, and apply the same `earlyWarnDateFor` window and acknowledgment filtering. `BdayAnnivEvent` gains `subjectUserId` and a `subjectKind: 'operator' | 'staff'` discriminator; `acknowledge` writes whichever id column applies.
- `supabase/functions/send-staff-birthday-message/index.ts`: accept either `operatorId` (current path, unchanged) or `staffUserId`. For staff, resolve name/email from `profiles` + auth user and send the same branded email plus `notifications` row. Keep the existing staff-role authorization check.
- `src/components/staff/SendBirthdayAnniversaryModal.tsx` and `BirthdayAnniversaryPopup.tsx`: pass the new discriminator through; birthday template text is reused as-is.

## Verification

Set a birthday to today in a staff Edit Profile, sign in as another staff member and confirm the card appears in the popup, Send delivers the email/notification, and dismissing hides it for that viewer only. Confirm the birthday owner does not see their own card and the driver app profile popup is unchanged.