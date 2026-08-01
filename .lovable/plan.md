# Correction accepted, plus what the manifest builder actually does

Checked `buildManifestFromCache` before planning. It is half-right already:

- `manifestBuild.ts:101` — `hasRows = !!cached && (events?.events.length ?? 0) > 0`, so `renderable` is **already false** for an empty event set. Your read that it keys on "both rows present" is right in spirit but the length check is there.
- The leak is the other two fields: `cached: hasRows || !!pdf` and `printable: !!pdf` (`:108-111`). With a stale-or-present PDF the day is still advertised as cached and printable.
- And `RoadsideDayView` never consults `renderable` at all for keyed days — it branches on `day.cached`, then on both Dexie rows merely *existing* (`RoadsideDayView.tsx:39-64`). An event row holding `[]` satisfies that and goes native, drawing an empty grid under a Certified header. That is the blank-log path.

So the guard belongs in both places, and the recovery is neither the grid nor the embed.

# Plan

## 1. Split the retry exemption by class, not by kind

`queue/runner.ts` / `queue/types.ts`:

- `network` — exempt from `SERVER_ATTEMPT_LIMIT` for exempt kinds, as today. That is the dead-zone case.
- `server` and `rejected` — the ordinary limit (8) applies to exempt kinds too, with an alert on exhaustion.
- Terminal either way means `markTerminal`, never delete: the entry stays in Dexie, out of the driver-facing chip, and never flags the day.
- No `SERVER_ATTEMPT_LIMIT_EXEMPT` constant. Rewrite the `CASCADE_EXEMPT_KINDS` comment: the exemption covers cascade cancellation, purge and counts — point 3 in that list is removed, because a budget is not a silent drop.

## 2. Two new alert kinds

Add `unlock_record_rejected` and `alert_delivery_failed` to `SyncAlertKind`. A terminal `record_unlock` raises `unlock_record_rejected` through the queue; `raise_sync_alert` going terminal stays console-only and counted, since it is the one kind that would recurse.

## 3. Audit row survives a failed notification

Migration replacing `public.record_rods_unlock`, unchanged in authorization, reason check, idempotency and the `rods_unlock_events` insert:

- Wrap the `notifications` fan-out in `BEGIN … EXCEPTION WHEN OTHERS THEN … END` so a bad value cannot roll back the audit row.
- Add nullable `notification_state` (default `'delivered'`) and `notification_error` to `rods_unlock_events`; on failure write `'failed'` plus SQLSTATE and message, and `RAISE WARNING`.
- Return the unlock id regardless, so the queue entry succeeds.

## 4. Empty event set is an unavailable day, not a fallback

**Manifest** (`localDay`): compute the empty case explicitly — a keyed day with a cached header whose event row is present but `events.length === 0`. For that day set `renderable: false`, `printable: false`, `cached: false`, regardless of any PDF on the device. A structurally empty certified log makes the PDF for that date untrustworthy too; it is not offered for print, email-merge or download. Distinguish it in the comment from "no event row at all", which stays the legitimate PDF-embed case.

**View** (`RoadsideDayView`): for keyed days, require `day.renderable` before the native branch, and treat an event row with `events.length === 0` as not renderable independently of the manifest, so a stale manifest cannot re-open the path. Fall through to the existing `missing` state — the same honest tile any day without bytes shows, per Stage 3 §10.2 — never to the PDF embed, which on iOS Safari is the blank-frame path the native renderer exists to avoid.

Count it in `logNativeFallback` under a separate key so the driver-side dashboard distinguishes "hydrated before the structured cache existed" from "hydration wrote an empty certified log".

## 5. Purge the leftover certified logs

Through `purge-rods-day` (staff session), both ids — `55afece3-ef65-4aa0-a370-701b32e2da05`, `5f83bace-ac92-46ae-9b48-c9bc00ab052c` — with the verbatim reason:

> "Verification-run cleanup: authorized-unlock Playwright pass 2026-08-01, harness-seeded certified logs 2026-07-02."

Re-query `rods_days` after and confirm it is empty, closing the demo-mode clean-truncate window.

## 6. Register entry and run doc

File the empty-event-set guard as a defect dated today: hydration (`ensureDayCached:137-144`) is the writer that can persist `events: []`; the reconcile in `authorizedUnlock` touches only `rods_days_cache` and is not implicated; `certify_rods_day` raises **P0023** for a zero-event keyed day, so the two rows I hit were harness direct inserts (`created_at = certified_at = updated_at`, totals 0) and the divergence itself was a test artifact — the render exposure is not. Record Run B's setup as the reproduction.

## Technical notes

- Files: `queue/types.ts`, `queue/runner.ts`, `queue/alerts.ts`, `manifestBuild.ts`, `RoadsideDayView.tsx`, one migration, `docs/eld-certification-playwright-run.md`.
- Tests: unlisted SQLSTATE classifies `server` (locks the fallback in); exempt kind with a `server` error goes terminal at attempt 8 and raises `unlock_record_rejected`, while `network` on the same kind does not; manifest test that an empty event row yields `cached/renderable/printable` all false even with a PDF present; view test that the same day renders the unavailable tile and no `<object>` embed.
