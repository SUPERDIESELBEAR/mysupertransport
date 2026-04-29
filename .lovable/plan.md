# Fix "App Not Installed" false negatives & add real engagement tracking

## Problem recap

`operators.pwa_installed_at` is only stamped when the user opens `/dashboard` **as an installed PWA** (`display-mode: standalone`) **after** they have an `operators` row. That means:
- Users who completed onboarding in a browser tab show "Not installed" forever (they never installed).
- Users who installed but always tap email/SMS links (which open in browser, not the installed app) show "Not installed."
- Users who installed before being approved (still applicants) get missed because the effect bails when `operatorId` is null.
- We have no signal at all for *"never logged in"* vs *"logs in via web but didn't install."*

## What we're building

Three improvements bundled together:

**A. Broaden the install detector** so it fires from every authenticated page, not just `/dashboard`.

**B. Listen for the PWA `appinstalled` event** (Android Chrome) so we capture installs the moment they happen, even before reopen.

**C. Add web-session tracking** so the roster can distinguish *Never seen* / *Web only* / *Installed* instead of one blunt "Not installed" stamp.

---

## Database change

One migration adds a single column to `operators`:

```sql
ALTER TABLE public.operators
  ADD COLUMN last_web_seen_at timestamptz;
```

We keep `pwa_installed_at` exactly as-is (first time we see them in standalone mode = "installed"). The new column tracks any portal visit (browser or standalone). No RLS change needed — existing operator policies cover it.

Also add a tiny SECURITY DEFINER RPC so the client can update its own row without an extra RLS policy permutation:

```sql
CREATE OR REPLACE FUNCTION public.mark_operator_seen(_standalone boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _op_id uuid;
BEGIN
  SELECT id INTO _op_id FROM operators WHERE user_id = auth.uid() LIMIT 1;
  IF _op_id IS NULL THEN RETURN; END IF;
  UPDATE operators SET
    last_web_seen_at = now(),
    pwa_installed_at = CASE WHEN _standalone AND pwa_installed_at IS NULL THEN now() ELSE pwa_installed_at END
  WHERE id = _op_id;
END $$;
```

This makes the client side a single call: `supabase.rpc('mark_operator_seen', { _standalone: isStandalone() })`.

---

## Code changes

### 1. New hook: `src/hooks/useTrackOperatorPresence.ts`
- On mount (and when auth user is present), call `mark_operator_seen` once per session.
- Detect standalone via existing `isStandalone()` helper in `src/lib/pwa.ts`.
- Listen for `window.appinstalled` event → call `mark_operator_seen(true)` immediately.
- Listen for `display-mode: standalone` media query change (rare but happens on Android after install).
- Skip in iframe/preview contexts (`isPreview` check, same as today).

### 2. Mount the hook globally
In `src/App.tsx`, mount `<TrackOperatorPresence />` (a tiny wrapper that just calls the hook) inside the authenticated layout so it fires on **every** operator page — Welcome, dashboard, settlement, binder, ICA sign, anywhere.

### 3. Remove the old narrow effect
Delete the `useEffect` block at `src/pages/operator/OperatorPortal.tsx:400–421`. The new global hook supersedes it.

### 4. Roster: 3-state install signal
In `src/components/drivers/DriverRoster.tsx`:
- Fetch `last_web_seen_at` alongside `pwa_installed_at`.
- Replace the single Smartphone icon with a 3-state indicator:
  - **Green phone** → `pwa_installed_at` set → tooltip: "Installed {date}"
  - **Amber globe** → `last_web_seen_at` set, `pwa_installed_at` null → tooltip: "Uses web only — last seen {date}"
  - **Grey phone** → both null → tooltip: "Never signed in"
- Update the compliance filter chip "App not installed" to split into two filters: **"Web only"** and **"Never signed in"** so management can target the right re-engagement message.
- Update the count tile in `ManagementPortal.tsx` overview to show the same three buckets.

### 5. OperatorDetailPanel
In `src/pages/staff/OperatorDetailPanel.tsx`, also fetch and display `last_web_seen_at` next to the existing install date so staff can see the full picture on a single profile.

### 6. PendingInviteAcceptance cross-check
Already cross-references `pwa_installed_at`. Extend it to also treat `last_web_seen_at` as "accepted" — if they've signed in via web, they're not really a pending invite anymore.

---

## What stays the same
- The `/install` page, install banner, invite email — all unchanged.
- `pwa_installed_at` semantics — unchanged (still "first seen in standalone mode").
- All existing RLS policies — unchanged.
- No service worker, no `vite-plugin-pwa` — we're a manifest-only PWA and that's fine.

---

## Files touched

```text
NEW   supabase migration (add column + RPC)
NEW   src/hooks/useTrackOperatorPresence.ts
NEW   src/components/TrackOperatorPresence.tsx (1-liner wrapper)
EDIT  src/App.tsx                                  (mount tracker)
EDIT  src/pages/operator/OperatorPortal.tsx       (remove old effect)
EDIT  src/components/drivers/DriverRoster.tsx     (3-state icon + split filter)
EDIT  src/pages/management/ManagementPortal.tsx   (3-bucket overview tile)
EDIT  src/pages/staff/OperatorDetailPanel.tsx     (show last_web_seen_at)
EDIT  src/components/management/PendingInviteAcceptance.tsx
```

---

## Backfill note

Existing operators with no install record will start populating `last_web_seen_at` the next time they log in. There's no historical data to backfill — `auth.users.last_sign_in_at` exists but isn't queryable from RLS-protected client code. The roster will show accurate state for any operator who returns to the portal once after this ships. Staff can also manually mark someone as installed from the detail panel if needed (small "Mark as installed" button — included in the OperatorDetailPanel edit).
