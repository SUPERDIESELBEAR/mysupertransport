## Status
The fix to remove the standalone key (Change Password) icon from the operator header was already applied to `src/pages/operator/OperatorPortal.tsx` in the previous turn. The screenshot still shows the icon because it is the **published build** (`mysupertransport.lovable.app`) which has not been republished yet.

## What's needed
1. **Republish the app** so the deployed PWA picks up the change. After republishing, fully close and reopen the SUPERDRIVE PWA on the iPhone (or pull-to-refresh) to bypass the cached service worker.
2. **No additional code changes required.** The header now renders only: profile avatar → notification preferences (sliders) → notification bell → sign-out (desktop only) → hamburger (mobile). The "Change Password" entry with the key icon stays inside the hamburger drawer, alongside Edit Profile and Sign Out.

## Verification after republish
- Open SUPERDRIVE on the iPhone.
- Confirm the key icon no longer appears next to the profile avatar in the top header.
- Open the hamburger (three-line) menu and confirm "Change Password" with the key icon is still listed between Edit Profile and Sign Out.