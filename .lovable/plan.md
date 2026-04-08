

## Use SUPERTRANSPORT Logo as PWA Icon

Replace the generated "SD" icons with the existing SUPERTRANSPORT logo (`src/assets/supertransport-logo.png`) for the PWA home screen icon.

### Approach

1. Copy `src/assets/supertransport-logo.png` to `public/icon-512.png` (overwrite)
2. Generate a resized 192px version and save as `public/icon-192.png` (overwrite)
3. Both will be created using a script that reads the logo and produces properly sized PNGs with the dark background (#111111) and the logo centered/contained within

Since the logo is likely wide/rectangular, the icons will place it centered on a square dark background so it looks good as an app icon on phone home screens.

### Files changed

| File | Change |
|------|--------|
| `public/icon-192.png` | Overwrite — 192px square with logo centered on dark background |
| `public/icon-512.png` | Overwrite — 512px square with logo centered on dark background |

No other files need changes — `manifest.json` already references these paths.

