# Messaging Contacts — Revised Plan

## Behavior summary
- Every driver's Contacts automatically shows their **assigned onboarding lead** (`operators.assigned_onboarding_staff`) and **current dispatcher** (latest `active_dispatch.assigned_dispatcher`), even if those staff have never opened their availability settings.
- The onboarding lead or dispatcher can **toggle themselves off for a specific driver** (e.g. after handoff). That suppression is per-driver; it does not affect other drivers.
- If the dispatcher changes, the old dispatcher stops auto-populating for that driver, but **the existing message thread and all history stay intact.** Nothing is deleted; the driver can still see prior messages, and if the old dispatcher re-messages the driver the thread just resumes.
- Contact rows in the driver's list display the **staff member's name** with their **role** ("Onboarding Coordinator", "Dispatcher", "Management", "Owner") **on the line below the name.**

## Data model change
Add one table for per-driver suppressions (opt-outs). We keep `driver_staff_contacts` for explicit includes; suppressions are separate so the semantics stay clear.

```sql
CREATE TABLE public.driver_staff_contact_suppressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  staff_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (driver_id, staff_id)
);
-- GRANTs + RLS: staff can insert/delete their own rows (staff_id = auth.uid());
-- driver can SELECT rows where driver_id = auth.uid(); owner/management full access.
```

No changes to `messages`, `message_threads`, or `thread_participants` — history is preserved automatically.

## RPC changes (one migration)

### `list_driver_contacts(_driver)`
Return the union of:
1. Staff with `availability_mode = 'all_drivers'` — `source = 'all_drivers'`
2. Staff in `driver_staff_contacts` for this driver where mode = `specific_drivers` — `source = 'specific'`
3. `operators.assigned_onboarding_staff` for this driver — `source = 'assigned_onboarding'`
4. Dispatcher on the driver's most recent `active_dispatch` row — `source = 'assigned_dispatcher'`

Then **exclude** any `(driver_id, staff_id)` present in `driver_staff_contact_suppressions`.

Include the staff role in the returned row (already does) so the UI can render "Dispatcher" / "Onboarding Coordinator" / "Management" / "Owner" under the name.

### `can_driver_message_staff(_driver, _staff)`
Return TRUE when the staff member appears in the same union above (i.e. any of `all_drivers`, `specific_drivers` mapping, assigned onboarding, current dispatcher), AND is not suppressed. Governs whether the driver can start a new thread.

## UI changes

### `src/components/staff/StaffAvailabilityCard.tsx`
- When mode = `specific_drivers`, show a searchable multi-select of active drivers to grant explicit access (writes `driver_staff_contacts`).
- New section **"Auto-assigned drivers"** listing every driver the current staff member is auto-included for (assigned onboarding lead or current dispatcher). Each row has a toggle:
  - ON (default): auto-included in that driver's Contacts.
  - OFF: inserts a `driver_staff_contact_suppressions` row for `(driver_id, me)`. Toggling back removes the row.
- Copy makes clear that turning off only hides you from that driver's Contacts list going forward — the existing message thread and history remain.

### `src/components/operator/DriverContactsPanel.tsx`
- Render each contact as:
  ```
  Emma Mueller
  Onboarding Coordinator
  ```
  (name on line 1, role label on line 2, matching the existing typography — role currently shown as a small muted line, keep that treatment).
- Role label map: `owner` → "Owner", `management` → "Management", `dispatcher` → "Dispatcher", `onboarding_staff` → "Onboarding Coordinator", else "SUPERTRANSPORT Staff".
- Drop the shield icon on `source = 'specific'`; no per-source badges needed since the role line already conveys context.

## What is NOT changed
- Group chats, notification fan-out, thread schema, and existing 1:1 threads are untouched.
- No message data is ever deleted when a dispatcher or onboarding lead changes. Threads persist; only auto-population of the Contacts list is affected.
