

## SUPERDRIVE PWA — Install Banner From First Visit

Yes — the install banner will appear from the very first moment someone opens the app, including when they land on the application form. Here's how:

### How it works

The `PWAInstallBanner` component will be placed in `App.tsx` at the top level, outside of any authentication or role checks. This means it renders on **every page**, including:

- The splash/landing page
- The application form (before they're even an operator)
- Login page
- All operator and staff pages after login

The banner will show once per device and remember when it's been dismissed via localStorage, so it won't nag returning users.

### Files changed

| File | Change |
|------|--------|
| `public/manifest.json` | New — manifest with "SUPERDRIVE" name, standalone display, icons |
| `public/icon-192.png` | New — 192px app icon with brand colors and "SD" |
| `public/icon-512.png` | New — 512px app icon |
| `index.html` | Title → "SUPERDRIVE", add manifest link, Apple meta tags, theme-color |
| `src/main.tsx` | Add service worker cleanup guard for preview/iframe environments |
| `src/components/PWAInstallBanner.tsx` | New — install banner (Android prompt + iOS instructions), renders on all pages including application form |
| `src/App.tsx` | Add `<PWAInstallBanner />` at top level, outside auth/routing |

