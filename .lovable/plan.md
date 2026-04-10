

## Implement PWA Installation Tracking

### Overview
Add a `pwa_installed_at` column to the `operators` table. Auto-detect standalone mode in the Operator Portal and record the timestamp. Surface the install status in the Driver Hub roster and Operator Detail Panel.

### Changes

**1. Database Migration**
Add `pwa_installed_at timestamptz` column to `operators`:
```sql
ALTER TABLE public.operators ADD COLUMN pwa_installed_at timestamptz;
```
No RLS changes needed — existing staff SELECT/UPDATE and operator SELECT policies cover this column automatically.

**2. Auto-Report from Operator Portal** (`src/pages/operator/OperatorPortal.tsx`)
Add a `useEffect` after `operatorId` is set:
- Detect standalone mode via `window.matchMedia('(display-mode: standalone)').matches` or `(navigator as any).standalone`
- Skip if in preview mode (`isPreview`)
- Query `operators` table for this operator's `pwa_installed_at`
- If null, update it to `now()`
- Fire-and-forget — no UI impact

**3. Driver Hub Roster** (`src/components/drivers/DriverRoster.tsx`)
- Add `pwa_installed_at` to the `DriverRow` interface
- Fetch it alongside `is_active` in the second operators query (line ~425)
- Display a small phone icon (green if installed, gray if not) in a new narrow column or next to the driver name
- Add a filter option "App Not Installed" to allow staff to quickly find operators who haven't installed

**4. Operator Detail Panel** (`src/pages/staff/OperatorDetailPanel.tsx`)
- Fetch `pwa_installed_at` from the operator record (already fetched on load)
- Next to the existing "Send Install Instructions" button, show:
  - If installed: a green "App Installed" badge with the date
  - If not installed: the existing phone button remains as-is (no extra badge)
- Update the tooltip on the phone button to reflect status ("Resend install instructions" vs "Send install instructions")

### Technical Details

| File | Change |
|------|--------|
| Migration | `ALTER TABLE operators ADD COLUMN pwa_installed_at timestamptz` |
| `src/pages/operator/OperatorPortal.tsx` | Add standalone detection useEffect that writes `pwa_installed_at` |
| `src/components/drivers/DriverRoster.tsx` | Fetch + display install status icon, add "App Not Installed" filter |
| `src/pages/staff/OperatorDetailPanel.tsx` | Fetch + show install status badge near the install-instructions button |

### Self-Healing for Existing Operators
No manual backfill is needed. The first time any operator who already has the app installed opens it after this deploys, the `useEffect` will fire and record their `pwa_installed_at`. Within a few days of normal usage, all active installed operators will be recorded automatically.

