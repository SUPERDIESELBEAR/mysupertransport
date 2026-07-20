## Problem

Clicking **Open in Binder** from Fleet Compliance now correctly lands on the **Driver Docs** tab, but users can no longer switch to Company Docs, Driver Uploads, or Staging. Clicking another tab briefly changes `activeTab`, then the URL-sync effect in `InspectionBinderAdmin.tsx` (lines 160–167) sees `?tab=driver` is still in the URL and forces `activeTab` back to `driver`.

## Fix

In `src/components/inspection/InspectionBinderAdmin.tsx`, change the `?tab=` sync effect so it applies the URL value once and then removes `tab` from the URL, instead of continuously enforcing it.

Specifically, in the effect at ~line 162:

- When a valid `tab` param is present, call `setActiveTab(t)`.
- Then immediately strip `tab` from `searchParams` via `setSearchParams(next, { replace: true })`, preserving all other params (`driver`, `flipbook`, etc.).
- Keep the dependency array on `[searchParams]` so it runs on deep-link entry and becomes a no-op once the param is cleared.

Because the tab param is consumed and removed on arrival, the sync effect never fires again for the current visit — the user's tab clicks are fully respected and they can move freely between **Driver Docs**, **Company Docs**, **Driver Uploads**, and **Staging**.

No other files need to change. `ManagementPortal.tsx` still sets `?tab=driver` when opening from Fleet Compliance; the binder consumes it once.

## Verification

- Fleet Compliance → **Open in Binder** on a driver: lands on **Driver Docs** with the driver preselected.
- From there, clicking any of **Company Docs**, **Driver Uploads**, or **Staging** switches to that tab and stays there. Clicking back to **Driver Docs** also works. No tab is locked.
- Direct visit to `/…inspection-binder?tab=company` still lands on Company Docs, and subsequent tab clicks work.
- Dispatch board **Binder** button (flipbook path) is unchanged.
