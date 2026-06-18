## Make every notification click land on the exact record

The first pass shipped the infrastructure but two real bugs remain, which is why clicks still don't deep-link:

1. The bell's portal detector uses `window.location.pathname`, but `/dashboard` is shared by Management, Staff, and Operator portals (routed by `activeRole` in `App.tsx`). So even when `entity_id` is set, the route can be wrong.
2. Every notification currently in the database has `entity_type` / `entity_id` = NULL, so the bell falls back to the legacy `link` which is generic (e.g. `/dashboard`, `/dispatch`, `/operator?tab=documents`).

Plus several insertion sites still don't write the entity columns.

---

### Fix 1 — Resolver uses the user's active role (not pathname)

`src/components/NotificationBell.tsx`
- Replace `detectPortal()` (which reads `location.pathname`) with a derivation from `useAuth().activeRole`:
  - `management` / `owner` → management portal
  - `onboarding_staff` → staff portal
  - `dispatcher` → dispatch portal
  - `operator` / `truck_owner` → operator portal
- Drop the `useLocation` import.

### Fix 2 — Legacy-link fallback (makes old notifications work immediately)

In `resolveRoute()`, if `entity_type` / `entity_id` are missing, parse the stored `link` with a regex for `[?&](operator|op|app)=<uuid>`. If found, treat it as the right entity type and run the same portal-aware routing. This covers nearly every historical link (e.g. `/staff?operator=<id>`, `/dashboard?view=operator-detail&op=<id>`, `/management?op=<id>`).

### Fix 3 — Backfill historical notifications (one SQL migration)

```sql
-- Operator-scoped legacy links
UPDATE public.notifications
SET entity_type = 'operator',
    entity_id = (regexp_match(link, '[?&](?:operator|op)=([0-9a-f-]{36})'))[1]::uuid
WHERE entity_id IS NULL
  AND link ~* '[?&](operator|op)=[0-9a-f-]{36}';

-- Application-scoped legacy links
UPDATE public.notifications
SET entity_type = 'application',
    entity_id = (regexp_match(link, '[?&]app=([0-9a-f-]{36})'))[1]::uuid
WHERE entity_id IS NULL
  AND link ~* '[?&]app=[0-9a-f-]{36}';
```

### Fix 4 — Update the 10 DB trigger functions

These all insert into `notifications` and currently skip `entity_type`/`entity_id`. One migration updates each to include them:

- `notify_operator_on_status_change`
- `notify_on_truck_down`
- `notify_driver_on_upload_status_change`
- `notify_staff_on_docs_uploaded`
- `notify_staff_on_release_note`
- `notify_operators_on_fleet_share`
- `notify_owner_on_pay_setup_submitted`
- `handle_operator_deactivated`
- `approve_application_correction`
- `reject_application_correction`

Each gets `entity_type='operator'` + `entity_id=<operator id in scope>` (or `'application'` for the correction functions). Bodies otherwise unchanged.

### Fix 5 — Edge functions missed in the first pass

- `supabase/functions/notify-new-message/index.ts` → add `entity_type`/`entity_id` (operator or message_thread).
- `supabase/functions/send-birthday-anniversary/index.ts` → add `entity_type='operator'`, `entity_id=<operator id>`.

---

### Result

After this lands:
- Existing notifications already in the bell deep-link correctly via the legacy-link parser + the SQL backfill.
- New notifications from every edge function and every DB trigger carry their entity reference.
- A management user clicking "Application Approved" lands on `/management?view=operator-detail&op=<id>`; a staff user lands on `/staff?view=operator-detail&operator=<id>`; etc.

### Files

- `src/components/NotificationBell.tsx`
- One Supabase migration: backfill + the 10 trigger-function updates
- `supabase/functions/notify-new-message/index.ts`
- `supabase/functions/send-birthday-anniversary/index.ts`