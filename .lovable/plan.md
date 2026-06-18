# Pipeline: "App Installed" Status Badge

## Goal
Once a driver opens SUPERDRIVE as an installed PWA, replace the gold **"Send App Install"** action chip on the Pipeline row with a non-clickable **green "App Installed"** badge — keeping the Smartphone (phone) icon in both states.

## How install is already detected
The project already tracks installs:

- `operators.pwa_installed_at` (timestamptz) is stamped the first time the driver visits SUPERDRIVE in standalone/PWA mode. This is done client-side by `useTrackOperatorPresence` via a Supabase RPC.
- The same column already powers the "App Installed / Web Only / Never Signed In" indicators on the Driver Roster and Management dashboard.

No new tracking, edge function, or migration is needed. We just read this existing column on the pipeline row.

## Changes (frontend only)

### `src/pages/staff/PipelineDashboard.tsx`

1. **OperatorRow type** (≈ line 327): add  
   `pwa_installed_at: string | null;`

2. **Operator select queries**: include `pwa_installed_at` in the `operators` select used to build pipeline rows (around line 1043 where the main pipeline list is fetched). Map it onto each row alongside `never_logged_in`, defaulting to `null`.

3. **Badge render block** (≈ lines 3269-3295, the `{op.user_id && (...)}` chip):
   - If `op.pwa_installed_at` is set:
     - Render a non-interactive `<span>` (not a button — no click handler, no disabled cursor).
     - Classes use the existing status-complete tokens already used elsewhere on this page:  
       `bg-status-complete/10 text-status-complete border-status-complete/30`
     - Icon: keep `<Smartphone className="h-2.5 w-2.5 shrink-0" />` (per request, same phone icon in both states).
     - Label: **"App Installed"**.
     - Tooltip: `App installed {formatted date}` using `format(parseISO(op.pwa_installed_at), 'MMM d, yyyy')`.
   - Else: keep the existing gold "Send App Install" / "Sent" button exactly as it is today.

No business-logic changes, no schema changes, no edge-function changes. Layout, sizing, and the surrounding row are untouched.

## Out of scope
- Driver Roster, Management dashboard, and email/install flows already use `pwa_installed_at` correctly — not modifying them.
- No change to install-detection logic itself.
- No change to the "Send App Install" button behavior, copy, or cooldown when the app is not yet installed.

## Visual states (after change)

```text
Not installed yet:   [📱 Send App Install]   (gold, clickable)
Just sent:           [✓ Sent]                (gold, disabled — unchanged)
Installed:           [📱 App Installed]      (green, non-clickable)
```
