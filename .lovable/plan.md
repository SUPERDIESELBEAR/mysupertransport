

## Hide specific drivers from the Dispatch Hub

### The problem

The Dispatch Hub pulls every operator where `is_active = true` and `fully_onboarded = true`. That's the right default, but it sweeps in two kinds of drivers who shouldn't affect the daily counts:

- **Backup-only drivers** (e.g. an O/O whose hired driver runs the truck most days; the O/O only drives when the driver is off).
- **Non-driving accounts** (e.g. your own Marcus Mueller test account).

Today they're counted in **Total Active**, **Dispatched**, **Home**, **Truck Down**, and **Not Dispatched**, which skews the dashboard.

Deactivating them isn't right either — that strips them from the Driver Hub, Fleet Roster, messaging, ICA, etc. We just want them **excluded from the dispatch board**, while staying fully active everywhere else.

### Recommendation

Add a per-operator **"Exclude from Dispatch Hub"** flag. Toggleable from the Operator Detail Panel (staff/management only). Off by default. When ON:

- The driver does **not** appear in the Dispatch Portal list.
- They are **not** counted in any of the 5 status tiles (Total Active, Dispatched, Home, Truck Down, Not Dispatched).
- They are **not** counted in Management Portal's "Trucks Down" banner or dispatch overview.
- They are **excluded** from `MiniDispatchCalendar` / dispatch-history surfaces.
- They **still** appear normally in: Driver Hub, Fleet Roster, Pipeline, Messaging, Inspection Binder, Compliance, Settlement Forecast, ICA, Equipment, Notifications.

### What you'll see

**In the Operator Detail Panel** (staff & management view), inside the existing "Status & Access" area near the Deactivate / Reactivate button, a new gold toggle row:

> 🚫 **Exclude from Dispatch Hub**
> *Hides this driver from the Dispatch Board and removes them from daily dispatch counts (Total Active, Dispatched, Home, Truck Down, Not Dispatched). Use for backup-only drivers, owners who don't run loads daily, or test accounts. Driver remains fully active everywhere else.*
> *Optional reason field below (e.g. "Backup driver for Truck 412 — runs only when primary driver is off")*

When toggled ON, a small gold "Excluded from Dispatch" pill appears at the top of the panel next to the unit number.

**In the Dispatch Portal**, an unobtrusive footer line under the status tiles:

> *Showing 23 of 25 active operators. 2 excluded from Dispatch Hub — [View](link)*

Clicking opens a small dialog listing the excluded drivers with a one-click "Re-include in Dispatch" button per row, in case you want to bring someone back in.

**In the Management Portal "Trucks Down" banner** and **dispatch overview** widget — same exclusion applies; counts only reflect dispatch-eligible drivers.

### How it works (technical)

**1. Database — one migration**

Add to `public.operators`:
```sql
ALTER TABLE public.operators
  ADD COLUMN excluded_from_dispatch boolean NOT NULL DEFAULT false,
  ADD COLUMN excluded_from_dispatch_reason text NULL,
  ADD COLUMN excluded_from_dispatch_at timestamptz NULL,
  ADD COLUMN excluded_from_dispatch_by uuid NULL;
```

No RLS changes needed (existing `operators` policies cover it).

**2. Frontend — small surgical edits**

- **`src/pages/staff/OperatorDetailPanel.tsx`** — add the toggle UI in the Status & Access block (≈ near line 1979 where the Deactivate button lives). On change: update `operators` row, write `audit_log` entry (`action: 'operator.dispatch_exclusion_changed'`, metadata `{ from, to, reason }`), update local state. Show "Excluded from Dispatch" gold pill in header when ON.
- **`src/pages/dispatch/DispatchPortal.tsx`** — `fetchDispatch` (line 490): add `.eq('excluded_from_dispatch', false)` to the operators query. Also select the field so we can show the "X excluded — View" footer + dialog. Realtime channel already covers `operators` updates indirectly via the existing refresh, but add a subscription on `operators` UPDATE so toggling exclusion live-updates the board for everyone.
- **`src/pages/management/ManagementPortal.tsx`** — the two `active_dispatch` aggregate queries (lines ~186, ~199, ~504) need to inner-join operators and filter `operators.excluded_from_dispatch = false`. Equivalent pattern: switch from `.from('active_dispatch')` to `.from('active_dispatch').select('..., operators!inner(excluded_from_dispatch)').eq('operators.excluded_from_dispatch', false)`.
- **`src/components/drivers/DriverRoster.tsx`** — no exclusion filter (driver hub still shows everyone), but read the field and surface a small "Excluded from Dispatch" muted pill on the row so staff has visibility.
- **`src/components/dispatch/MiniDispatchCalendar.tsx`** — if the operator is excluded, render a small empty state ("This driver is excluded from the Dispatch Hub.") instead of the calendar.
- **`src/integrations/supabase/types.ts`** — auto-regen.

**3. Audit trail**

Toggling the flag writes an `audit_log` row mirroring the existing `operator_deactivated` pattern (lines 1614–1624 of OperatorDetailPanel).

### Files touched

```text
supabase/migrations/<new>.sql                               [+ 4 columns on operators]
src/integrations/supabase/types.ts                          [auto-regen]
src/pages/staff/OperatorDetailPanel.tsx                     [+ toggle UI + audit + header pill]
src/pages/dispatch/DispatchPortal.tsx                       [+ filter + footer + dialog]
src/pages/management/ManagementPortal.tsx                   [+ filter on 3 aggregate queries]
src/components/drivers/DriverRoster.tsx                     [+ small "Excluded" pill]
src/components/dispatch/MiniDispatchCalendar.tsx            [+ empty state when excluded]
mem://features/dispatch/excluded-from-dispatch              [NEW memory]
```

### What you'll do after deploy

Open each of the two drivers (your account + the backup O/O), flip the **"Exclude from Dispatch Hub"** toggle ON, optionally add a reason. The board immediately drops them from the list and recalculates the 5 tiles. If the backup driver ever needs to be tracked daily again, flip it off — no data is lost.

### Out of scope

- No change to Deactivate/Reactivate flow.
- No change to who can message, dispatch-assign manually, or view these drivers — exclusion only hides them from the Dispatch Hub aggregation.
- No bulk-toggle UI; per-driver only (you mentioned ~2 drivers, so a bulk tool would be overkill).

