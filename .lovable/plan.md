## Expand notifications & deep-link to the relevant record

Two related bell-dropdown fixes that apply across all portals (management, staff, dispatch, operator):

1. Make truncated notifications fully readable.
2. Make clicking a notification land on the specific record/thread it refers to — not just the tab.

---

### Part 1 — Read the full notification text

**File:** `src/components/NotificationBell.tsx`

- Remove `truncate` from the title; allow it to wrap to 2 lines.
- Increase body `line-clamp` from 2 to 3 lines.
- Wrap each notification row in a `<Tooltip>` (already imported elsewhere in the project) showing the full title + body. Hover on desktop, long-press on mobile. The row remains a single click-target that navigates to the deep link.
- No layout shift; rows grow only as needed; dropdown keeps its `max-h-80 overflow-y-auto` scroll.

---

### Part 2 — Deep-link every notification to the right record

**Strategy:** stop hard-coding portal-specific paths in the edge functions. Instead, store the *entity* the notification is about and let `NotificationBell` resolve the destination based on the current user's portal.

**Schema (one migration):**

Add two nullable columns to `public.notifications`:

```
entity_type text   -- 'operator' | 'application' | 'message_thread' | 'release_note' | 'cert' | 'dispatch' | …
entity_id   uuid   -- id of that entity
```

Backfill not needed; old rows keep using `link`.

**`NotificationBell.tsx` — new resolver:**

A small helper `resolveNotificationRoute(notification, currentPortal)` returns the correct path. Examples:

```text
type=application_approved      entity_type=operator    →
  management:  /dashboard?view=operator-detail&op=<id>
  staff:       /staff?operator=<id>

type=onboarding_milestone      entity_type=operator    →
  management:  /dashboard?view=operator-detail&op=<id>
  staff:       /staff?operator=<id>
  operator:    /dashboard?tab=progress

type=pe_receipt_uploaded       entity_type=operator    → same as above

type=dispatch_status_change    entity_type=operator    →
  dispatch:    /dispatch?op=<id>
  operator:    /dashboard?tab=dispatch

type=truck_down                entity_type=operator    →
  dispatch:    /dispatch?op=<id>
  management:  /dashboard?view=operator-detail&op=<id>
  staff:       /staff?operator=<id>

type=new_message               entity_type=message_thread →
  /dashboard?tab=messages&thread=<id>   (per portal prefix)

type=docs_uploaded             entity_type=operator    → operator-detail panel

type=compliance_update         entity_type=operator    → operator-detail panel
type=application_denied        entity_type=application →
  management/staff: /dashboard?view=applications&app=<id>  (opens drawer)
type=release_note              entity_type=release_note → /dashboard?view=whats-new
type=pay_setup_submitted       entity_type=operator    → operator-detail panel
```

Current portal is detected from `window.location.pathname` (`/dashboard` = management/operator depending on role, `/staff`, `/dispatch`). Role is already available via `useAuth`.

Fallback chain: if `entity_type`/`entity_id` is missing → use stored `link` → final fallback `/dashboard`.

**Edge-function changes** (write `entity_type` + `entity_id` on every insert):

- `supabase/functions/invite-operator/index.ts` — application_approved: set `entity_type='operator'`, `entity_id=operatorId`.
- `supabase/functions/deny-application/index.ts` — application_denied: `entity_type='application'`, `entity_id=appId`.
- `supabase/functions/send-notification/index.ts` — every `notifications.insert` (onboarding_milestone, document_uploaded, dispatch_status_change, new_message, truck_down, pe_receipt_uploaded, compliance, release_note, etc.) — set entity columns.
- `supabase/functions/check-cert-expiry/index.ts` — operator entity.
- `supabase/functions/send-cert-reminder/index.ts` — operator entity.
- `supabase/functions/send-payroll-docs/index.ts` — operator entity.
- `supabase/functions/notify-pwa-install/index.ts` — operator entity.

**ManagementPortal deep-link expansion** (`src/pages/management/ManagementPortal.tsx`):
- Add reader for `?app=<id>` → fetch that application and open `ApplicationReviewDrawer` automatically (mirrors the existing `?op=` pattern).
- The "View original application" link inside an `operator-detail` view uses this same `?view=applications&app=<id>` pattern.

**StaffPortal & DispatchPortal:** verify each already accepts the `?operator=<id>` / `?op=<id>` params used above and opens the matching panel. (StaffPortal already does — `/staff?operator=<id>` is used by existing code; DispatchPortal needs a `?op=` reader if not present.)

---

### Files touched

- `src/components/NotificationBell.tsx` — tooltip, line-clamp bump, route resolver.
- `src/pages/management/ManagementPortal.tsx` — `?app=<id>` deep-link.
- `src/pages/dispatch/DispatchPortal.tsx` — `?op=<id>` deep-link (only if missing).
- One Supabase migration — add `entity_type`, `entity_id` to `notifications`.
- All edge functions listed above — populate the two new columns.

No RLS or permission changes (existing policies on `notifications` cover the new columns). Old notifications still work via the `link` fallback.