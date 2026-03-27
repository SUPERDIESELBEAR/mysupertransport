

## Fix Splash Page Preview Link in Content Manager

### Problem
The Splash Page card in Content Manager has its route set to `'/'`, which redirects logged-in users to `/dashboard`. The dedicated `/splash` route (added earlier specifically for previewing) bypasses this redirect.

### Fix
**File:** `src/components/management/EmailCatalog.tsx` (line 741)

Change the Splash Page route from `'/'` to `'/splash'` so the "Preview Page" button opens the actual Splash Page instead of redirecting to the dashboard.

Single line change — no other files affected.

