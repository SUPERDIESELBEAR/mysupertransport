## Problem

Omar opened his invite from Gmail, which launches the link inside Gmail's in-app browser (visible in his screenshot — "◀ Gmail" top-left). He sees the "Install SUPERDRIVE" banner at the bottom of the screen and tries to tap it, but nothing happens.

Two root causes:

1. **The banner has no tappable Install button on iOS.** Looking at `PWAInstallBanner.tsx`, on iOS the banner only renders instruction text ("Tap Share then Add to Home Screen") plus an X to dismiss. The download icon on the left looks like a button but isn't clickable. Android/desktop users get an actual "Install" button; iOS users get only text.

2. **iOS "Add to Home Screen" only works in Safari.** The Gmail in-app browser (and Facebook, Instagram, etc.) cannot install PWAs at all — there is no Share → Add to Home Screen option there. Omar would need to open the link in Safari first. Today the app does not detect this and gives no guidance.

## Proposed Fix

### 1. Make the iOS banner tappable

Convert the entire iOS banner into a button that, when tapped, opens a full-screen instructional modal showing the Share → Add to Home Screen steps (visual icons, larger text). This matches what `InstallStep.tsx` already renders on `/install-app` — we can reuse that component or a trimmed variant.

### 2. Detect in-app browsers and show a "Open in Safari" prompt

Add a UA-based check for common in-app webviews (Gmail, Facebook, Instagram, LinkedIn, Twitter/X, TikTok). When detected on iOS:
- Replace the install banner content with: "To install SUPERDRIVE, open this page in Safari. Tap the ⋯ menu and choose 'Open in Safari'."
- Include a copy-link button as a fallback.

### 3. Apply the same upgrades to `/install-app` page

The `InstallStep` component used on `/install-app` (which Omar will land on after tapping the resend-invite link) should also detect in-app browsers and show the "open in Safari" guidance up front, before showing the regular instructions.

## Files to Change

- `src/components/PWAInstallBanner.tsx` — make iOS banner tappable, open guidance modal, detect in-app browsers
- `src/components/InstallStep.tsx` — add in-app browser detection and "Open in Safari" guidance
- (Optional) `src/lib/pwa.ts` — extract shared helpers `isInAppBrowser()`, `isIOS()`, `isStandalone()` so both components share one source of truth

## Out of Scope

- No backend / email changes — the resend-invite link itself works, this is purely a client-side UX issue
- No service worker changes
- Android in-app browsers (Gmail on Android handles installs differently and is less commonly broken; can add later if needed)

## Communication to Omar

Once shipped, suggest he:
1. Open his Gmail invite
2. Tap the ⋯ menu in Gmail's browser bar → "Open in Safari" (or long-press the link → "Open in Safari")
3. Then tap Share → Add to Home Screen
