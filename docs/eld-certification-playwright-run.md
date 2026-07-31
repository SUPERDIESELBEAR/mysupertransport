# RODS certification — Playwright pass (2026-07-31)

Chromium headless, 1280×1800, real driver session minted through the staff QR
handoff. Every case purges in a `finally` through the `purge-rods-day` edge
function (the authoritative path).

## Cache hydration is opt-in, not setup

`hydrateRoadsideCache` is mounted only by `ELDMalfunctionView`, so the carrier
cache exists only after the driver has visited the ELD tab. The harness no
longer does this by default — it is an explicit `hydrate_via_eld_tab(page, case)`
call, and the cases that use it are named below.

| Case | Result | Needed the ELD-tab hydration? |
|------|--------|-------------------------------|
| (a) debounce race | **PASS** | **Yes** |
| (b) offline at certify | **PASS** | **Yes** |
| (c) backgrounding flush | **PASS** (Chromium) | **Yes** |
| (d) lost write | **PASS** | **Yes** |
| (e) out-of-band edit | **PASS** | **Yes** |
| (f) replay after timeout | **INCONCLUSIVE** | **Yes** |
| (g) direct route to Paper Logs | evidence captured | No — that is the point |

**Every one of (a)–(f) required the workaround.** None of them can currently be
reached by a driver who signs in and goes straight to Logs. The certification
path as a whole is unreachable on the direct route.

## (g) Direct route — the real-world path

Sign in → Logs, no ELD tab. Observed:

- Dexie `superdrive_roadside` exists, and **every store is empty**:
  `local_meta: 0`, `rods_days_cache: 0`, `rods_events_cache: 0`,
  `roadside_manifest: 0`, `sync_queue: 0`.
- Paper Logs renders: the malfunction banner, "8 of 8 days still need a log",
  the day strip, and "Print 8 blank sheets".
- Opening any day shows: *"Carrier details have not been downloaded to this
  device yet. Connect to the internet once and reopen this screen — the record
  cannot be created without the carrier name, USDOT number and terminal
  address required on the log."*
- The caches are **still empty** after opening a day. Nothing on this route
  populates them.

The copy is also wrong about the cause: the driver *is* online. Reconnecting
does nothing; only visiting the ELD tab does. Screenshots:
`g_logs_direct.png`, `g_day_direct.png`.

## (a) Debounce race — now actually raced

The earlier run was not evidence: the certify RPC went out 3.5 s after the last
keystroke, so the 700 ms debounce had already fired on its own.

This run freezes the page clock (`page.clock.pause_at`) so the debounce timer
cannot fire, and instruments `window.fetch` in-page so every timestamp and
ordering comes from **one clock** and a page-side sequence counter.

```
#0 final_keystroke   +0ms(virtual)
#1 rods_days_PATCH   +0ms(virtual)  body={"to_location":"Tulsa OK FINAL KEYSTROKE"}
#2 certify_tap       +0ms(virtual)
#4 certify_rpc       +0ms(virtual)
row: certified|Tulsa OK FINAL KEYSTROKE
```

The write carrying the final value is issued after the keystroke and before the
RPC, with the debounce provably unable to have fired. Attributable to
`flushPendingHeader()`.

## (b) Offline at certify

`Certify log` disables the moment the tab goes offline, and the modal shows
*"You're offline — changes will sync when reconnected."* Row stays `draft`.

## (c) Backgrounding

Clock frozen; `visibilitychange` → hidden and `pagehide` each produced a header
PATCH carrying the value, and each value was persisted
(`BOL-VIS-001`, `BOL-HIDE-002`). **Chromium only. iOS Safari stays UNVERIFIED
on the hardware checklist** — `pagehide` is the only reliable exit event there
and it must be confirmed on a real iPhone.

## (d) Lost write

A header PATCH was rewritten in flight so the server stored a different value
than the screen. The preflight caught it: *"Certifying locks the log
permanently, so SUPERDRIVE checked the saved copy first. It does not match what
you are looking at."* Row stayed `draft`.

## (e) Out-of-band edit

Note: **staff cannot write `rods_days`** — a REST PATCH with a staff token
affected 0 rows, which is correct. The realistic out-of-band writer is the same
driver on a second device, so the case now runs two real sessions. Device two
changed `Trailer number(s)`; device one's certify raised the mismatch dialog
naming Trailer no., and Cancel left device one's unsaved `To` value intact.

## (f) Replay — INCONCLUSIVE, and why

The first RPC was really sent (`route.fetch` → server applied it, returned
`replayed: false`), then a 504 was fulfilled to the client. The row was polled
to `certified`.

**The retry never happened.** After the 504 the editor had already reloaded and
was showing "Open certified log / Amend this log" — there is no second
`Certify log` to press. Net effect on the record is correct (1 certified row,
paths unchanged, no orphaned storage objects), but the `replayed: true` branch,
the replay toast, and the attempt-2 orphan delete are **not exercised by any
path a driver can reach**. They remain unverified code.

Follow-up needed: either the editor should surface an explicit retry after a
transport failure, or the replay branch should be acknowledged as reachable
only from the offline queue.

## Cleanup

After every case: `rods_days` 0, `rods_events` 0, `rods_amendments` 0,
`eld_malfunction_events` 0 for the demo operator, `pending_caller` 0. All new
`rods_day_purged` audit rows read `completed` or `not_applicable`.
