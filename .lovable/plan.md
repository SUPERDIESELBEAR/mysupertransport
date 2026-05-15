## Goal

Stop forcing staff to manually re-check the "Also email the applicant a please-disregard note" box every time they revert a revision request. Instead, let each role have a saved default (ON or OFF) that the modal honors automatically — while still allowing a per-revert override.

## UX

In `RevertRevisionModal.tsx`:

- The courtesy-email checkbox stays where it is, but its initial value comes from the current user's role default instead of a hardcoded `false`.
- Add a small helper line under the checkbox:

  ```
  Default for your role (Management): ON · Change default
  ```

  "Change default" is a link that opens the new settings panel (see below). Only visible to `management` / `owner` (others see just the static label, no link).

In **Management Portal → Settings** (or wherever the existing email/notification preferences live — to be confirmed during build by reading `ManagementPortal.tsx` and the existing `NotificationPreferencesModal.tsx`/`EmailCatalog.tsx`), add a small section:

```
Revision-Revert Courtesy Email Defaults
───────────────────────────────────────
When a staff member undoes a "revisions requested" email,
should the "send a please-disregard email" box be checked
by default?

  Owner               [ ON  · OFF ]
  Management          [ ON  · OFF ]
  Onboarding Staff    [ ON  · OFF ]
  Dispatcher          [ ON  · OFF ]

                                            [ Save ]
```

Defaults seeded as: **management = ON, owner = ON, onboarding_staff = OFF, dispatcher = OFF** (rationale: the people most likely to be cleaning up a misfire want the email to go automatically; ops staff who often coordinate via text don't).

## Permissions

- **View own role's default**: any staff (so the modal can render the helper text correctly).
- **Edit defaults table**: `management` + `owner` only.

## Technical pieces

### 1. New table `revert_courtesy_email_defaults`

```sql
create table public.revert_courtesy_email_defaults (
  role app_role primary key,
  send_by_default boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.revert_courtesy_email_defaults enable row level security;

-- Any staff can read (modal needs it)
create policy "Staff can read revert courtesy defaults"
  on public.revert_courtesy_email_defaults
  for select using (is_staff(auth.uid()));

-- Management/owner can write
create policy "Management can upsert revert courtesy defaults"
  on public.revert_courtesy_email_defaults
  for all
  using (has_role(auth.uid(), 'management') or has_role(auth.uid(), 'owner'))
  with check (has_role(auth.uid(), 'management') or has_role(auth.uid(), 'owner'));
```

Seed rows for all four roles via `supabase--insert`.

### 2. Frontend — `RevertRevisionModal.tsx`

- On open, fetch the caller's highest-priority role (reuse the same role-resolution helper used elsewhere; fall back to `onboarding_staff`).
- Fetch the matching row from `revert_courtesy_email_defaults` and seed `sendCourtesyEmail` state with `send_by_default`.
- Add the helper line + "Change default" link (gated to management/owner).
- Behavior of the existing **Confirm** button is unchanged — it still passes whatever `sendCourtesyEmail` is at confirm time to the edge function. This means a staff member can still uncheck for a one-off send.

### 3. Frontend — settings panel

New small component `RevertCourtesyDefaultsCard.tsx` mounted inside the existing management settings area (exact mount point confirmed during build). 4 toggle rows + a save button that upserts all four rows in one call.

### 4. Edge function

**No changes** to `revert-application-revisions`. The default lives client-side; the function still receives an explicit boolean. This keeps the function dumb and auditable, and keeps the modal as the single source of truth for what the user actually confirmed.

### 5. Audit log

When defaults are changed in the settings panel, write one `audit_log` row with `action = 'revert_courtesy_defaults_updated'`, `entity_type = 'settings'`, and metadata `{ before: {...}, after: {...} }` so we can see who flipped which toggle.

### 6. Memory

After build, append `mem://features/application-review/revert-courtesy-defaults.md` describing the table + role-default behavior, and link it from `mem://index.md` under the existing revert-revision note.

## Out of scope

- No per-user override (only per-role). If we ever need that, easy follow-up.
- No change to the courtesy email template content.
- No change to the revert flow itself.

## What you'll get

Staff in roles configured to "ON" will see the courtesy-email box already checked when they open the revert modal — confirm and the email goes. Staff in "OFF" roles see it unchecked, same as today. Management can flip the defaults per role from one settings card without redeploys.
