# Stage 3 — Offline Architecture & Roadside Presentation Mode

Delivered in two passes. Pass A is the read path and must pass the stricter roadside gate before Pass B begins.

## Pass A — Read path

### 1. PWA shell and cold-launch routing

- Configure the generated app-shell service worker with:
  - `navigateFallback: '/index.html'`
  - `navigateFallbackAllowlist` explicitly including `/roadside`
  - denylist exclusions for `/management/*`, `/staff/*`, and `/dispatch/*`
- Keep service-worker registration guarded so it does not register in dev, Lovable preview hosts, iframe preview, or when `?sw=off` is present.
- Keep `/roadside` as a session-independent route rendered outside the authenticated app gate.
- The `/roadside` boot path must not import the backend client directly or transitively.

### 2. Pass A `local_meta` population trigger

- Write `local_meta` on every successful authenticated app load, not only on sync.
- Store: operator legal name, driver/operator id, truck number, carrier identifiers, home terminal timezone.
- Refresh on each authenticated load so name, truck, carrier, or terminal changes propagate before Pass B exists.
- Pass B adds sync as an additional trigger; it does not replace this one.
- `/roadside` reads identity and timezone only from `local_meta`.

### 3. Explicit `eld_document` cache hydration

- On authenticated load, inspect the current roadside 8-day window.
- For every certified `record_source = 'eld_document'` day, verify bytes exist in `rods_documents` with matching size; otherwise download via signed URL and cache bytes, MIME type, filename, size, source path/version, `cached_at`.
- Show hydration progress in the cache-status chip while downloads run.
- This step stays in Pass B — uploaded ELD bytes can never be regenerated locally.
- Comment that Pass A keyed generate-on-read is temporary scaffolding to be unified with certification-time caching in Pass B, not kept as a second permanent path.

### 4. Renderability probe and HEIC fallback

- At hydration, for every image MIME type, probe actual decodability with an offscreen decode attempt. Never infer renderability from MIME type alone.
- Wrap each probe in a 2-second timeout and treat a timeout as `renderable: false`. Chrome may reject an undecodable format slowly or inconsistently, and an unbounded probe would stall hydration while the packet is in fact ready to show as named cards.
- Probe days in parallel, not serially, so one slow file cannot serialize the whole window.
- Store `renderable: boolean` on the `rods_documents` entry.
- Where decode succeeds, re-encode to JPEG at hydration and cache the converted bytes alongside the original. The original is retained as the record; the JPEG is display-only.
- Where decode fails or times out, `RoadsideDayView` renders a plain card naming the file, its date, and its record type, with an "Open file" action handing off to the OS viewer. Never a broken image icon.
- A cached-but-not-in-app-renderable day still counts as cached for chip purposes; the packet is not reported Incomplete for this reason.
- Pass B's upload-path canvas re-encode reduces new HEIC uploads but does not remove this fallback — existing Storage files stay HEIC.

### 5. Roadside manifest and packet readiness

- Build the manifest from the cached home-terminal timezone, never device timezone.
- Include only certified days in the 8-day packet.
- Keyed days: generate/cache PDFs from cached `rods_days` + `rods_events`.
- ELD document days: require hydrated bytes before Ready.
- Prune only when safe: never a manifest-referenced file, never a local-only/not-yet-uploaded artifact.

### 6. Roadside Presentation Mode UI

- `/roadside` renders entirely from IndexedDB. No login prompts, sync warnings, backend calls, or auth refresh.
- Displays carrier/driver/truck identity from `local_meta`, malfunction summary and 8-day order on the cover page, and day tiles for the window.
- Keyed certified logs render as PDFs; ELD-uploaded logs render from cached bytes or the named-card fallback.
- Label ELD-uploaded days `On file (ELD log)`; suppress calculated totals for them.
- PRINT works from cached bytes in Pass A. EMAIL/SHARE explain they complete in Pass B.
- Orientation: attempt `screen.orientation.lock('portrait')` inside a caught rejection — unsupported on iOS Safari and it will throw. Manifest `orientation: portrait` binds only the installed PWA, so a browser-tab `/roadside` can still be landscape.
- Design the layout to be legible in landscape rather than assuming portrait: header block, day strip, and all three action buttons remain reachable with no horizontal scrolling.

### 7. Cache-status chip

- States: Ready, Hydrating documents, Incomplete, Unavailable.
- Show progress such as `Caching 2 of 5 ELD logs` during hydration.
- Distinguish "bytes still hydrating" from "packet unavailable". Non-renderable-but-cached does not downgrade the state, and a probe timeout must not hold the chip in Hydrating.

## Pass A gate — acceptance tests

1. `/roadside` renders without an active session using only IndexedDB.
2. `local_meta` is populated after a normal authenticated load, before any Pass B sync exists.
3. ELD document days in the window are downloaded and cached before Ready.
4. Cold launch from the installed home-screen shortcut opens `/roadside` through the service-worker navigation fallback, with the app fully closed — not via in-app routing.
5. Cold-launch testing performed on installed iOS and installed Android.
6. `/roadside` renders in under two seconds when backend requests hang or time out slowly, not only under airplane-mode fast failure.
7. The hanging-network test proves the `/roadside` boot path awaits no backend auth/session call.
8. A HEIC `eld_document` day renders as a named card with an Open action on Android and as an image on iOS, with the packet reported Ready in both cases.
9. Hydration of a multi-day window containing an undecodable file completes without stalling; the chip leaves Hydrating within the probe timeout budget.
10. `/roadside` is fully usable in landscape on both platforms — no horizontal scrolling, all actions reachable.
11. Management, staff, and dispatch routes remain excluded from the offline navigation fallback.
12. A missing cache shows an honest unavailable/incomplete state, never a blank screen.

Automated validation: an architectural test walking the `/roadside` import graph that fails on any reachable backend client import, plus a headless cold-load and landscape-viewport check. Real-device checklist covers installed iOS and Android, since installed home-screen behavior cannot be fully proven from the sandbox.

## Pass B — Write path outline

- Unified offline sync queue for certifications, PDFs, signatures, notice retries, and officer email/share sends.
- Certification-time caching for keyed logs, unified with the temporary Pass A generate-on-read path.
- ELD document hydration remains a permanent authenticated-load/sync concern.
- Upload-path canvas re-encode of HEIC to JPEG, with the Pass A decode-probe fallback retained as the safety net.
- Offline certification with client/server validation parity and idempotent server replay.
- Offline rejection handling: rejected artifacts stay visible to the driver, never mislabeled for an officer.
- Scoped short links for ELD malfunction packets, separate from binder payload resolution.
- Client-side PDF merging for officer emails so local/offline bytes are included before upload/send replay.
