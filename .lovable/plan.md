# RODS record fidelity — carrier profile, offline-safe identity, §395.8 fields, grid layout

## Verified state

- `constants.ts` holds the correct carrier values. `1234567` / `MC-7654` exist only in `rodsRenderParity.test.tsx`. `rods_days` and `eld_malfunction_events` are both empty — no audit, no backfill.
- `carrier_name/usdot/mc` are snapshotted at draft creation but **rendered from constants** (`renderRodsDay.ts:41`, and via `hydrate.ts:87-89`). That is the live bug.
- `main_office_address` does not exist on `rods_days`. `total_mileage_today` and `period_start_time` exist and render nowhere.
- **`rods_days.home_terminal_timezone` does not exist.** The only such column is on `operators`. It is created here as a frozen snapshot column.
- Dexie v2 is already safe: the upgrade only stamps `origin`, clears nothing, redefines no primary key.
- `notice_pdfs` has a real write path (`cacheNotice`, `hydrate.ts:206`, called at line 273). Two narrow gaps remain, fixed below.

## 1. `carrier_profile` table

Single row: `legal_name`, `usdot_number`, `mc_number` (bare digits), `main_office_address`, `home_terminal_address`, `home_terminal_timezone text NOT NULL`, `fmcsa_division_state` default `'MO'`, `updated_at`. `CREATE UNIQUE INDEX carrier_profile_singleton ON public.carrier_profile ((true))`, GRANTs, RLS read for `authenticated`, management CRUD via `has_role`, `updated_at` trigger.

Seed: SUPERTRANSPORT, LLC / 2309365 / 788425 / 605 Madison St, Pleasant Hill, MO 64080 (both office and terminal) / America/Chicago / MO.

Office and terminal stay **two columns** holding the same value — §395.8 requires both fields and a second terminal would need them separate. A migration comment says so, so nobody "cleans it up."

**`constants.ts` bootstrap block grows to all seven fields**, not three, commented explicitly: bootstrap-only, used solely before the first successful hydration, **never** for a certified record. The blank 8-day packet pre-prints office and terminal addresses, and sheets that print with blank addresses are worse than slightly stale ones.

## 2. Offline identity — cached only

`local_meta` caches all seven carrier fields, written by `writeLocalMeta` on every authenticated load.

| Path | Source |
|---|---|
| Draft day creation (`useRodsDay`, `RodsView`) | `local_meta` |
| `UploadEldLogModal` | `local_meta` |
| Malfunction event creation (`ELDMalfunctionWizard`) | `local_meta` |
| `renderDutyStatusGrid` (blank packet) | `local_meta`, seven-field constants fallback |
| `useCarrierProfile` (live read) | **Management's edit screen only** |

A test asserts no creation module imports `useCarrierProfile`, and that it stays out of the `/roadside` graph.

**Write-safety for `writeLocalMeta`.** It runs on every authenticated load, and a flaky connection under a valid session can return an error or a partial row. It writes **only on a complete successful fetch of all seven fields**; on any error or partial result it leaves the existing `local_meta` untouched and logs. Otherwise a network blip nulls cached identity and a driver who worked offline yesterday hits the cold-start block today.

**Test:** seed a good `local_meta`, simulate a failed `carrier_profile` fetch on the next authenticated load, assert the cached record is byte-for-byte unchanged.

**Cold-start block.** With no cached carrier record, malfunction reporting, draft creation, and log upload are blocked with: "Connect to the internet once to set up offline logging." An honest block beats a record frozen with null carrier identity that the server guard will later reject.

## 3. Snapshot columns

- `rods_days.main_office_address text`
- `rods_days.home_terminal_timezone text` — new, frozen per day, seeded at draft creation from `local_meta.home_terminal_timezone`, falling back to the operator's value where set. Never a live query.
- `eld_malfunction_events`: `carrier_legal_name`, `carrier_usdot`, `carrier_mc`, `carrier_main_office_address` — frozen at creation, covered by the existing immutability trigger.

**`certify_rods_day` guard extended from 8 to 12 required header fields**: adds `main_office_address`, `carrier_usdot`, `carrier_mc`, and `home_terminal_timezone`. §395.8 requires the home terminal's time standard on the face of the record, and a certified log is not correctable afterward — a null zone must not be certifiable. Deliberate `total_mileage_today` and RECAP exclusions stay.

## 4. Client checklist parity with the server guard

`header_complete` in `rodsValidation.ts` checks the **same 12** fields. A client that passes where the server rejects puts a validly signed PDF in the rejection path for nothing.

Pass B §5's parity table gains four fixtures — missing `main_office_address`, `carrier_usdot`, `carrier_mc`, `home_terminal_timezone` — each expecting client **and** server to reject. Recorded rule: the parity table grows whenever the guard grows.

## 5. Read/write map for renderers

`renderRodsDay` and `RoadsideDayRender` read **the day row only** — no constant, no profile read, no operator read.

**`rodsHeaderFields(day, driverName)` — the third `{ timeZone }` argument is removed.** The zone is read from `day.home_terminal_timezone` inside the function, so it is structurally impossible to source elsewhere, and a historical log shows the terminal's zone as of that date. `renderMalfunctionNotice` reads the event's frozen carrier columns. Stage 4's `fmcsa_division_state` comes via `local_meta`.

The packet header renders from `local_meta` and stays stable as the officer swipes; each day's fields come from that day's row.

## 6. §395.8 fields and timezone naming

`rodsHeaderFields` gains, in printed order: main office address, total mileage today, and `24-hour period begins {period_start_time} — {tz}`. The certification timestamp gains the same suffix.

`carrierTimeZoneLabel(ianaZone, logDate)` uses `Intl.DateTimeFormat(..., { timeZoneName: 'long' })` and prints the **full name** — `Central Daylight Time` / `Central Standard Time`. Never `longGeneric`, never a reconstructed parenthetical, never the IANA id. Resolved at **noon local** on the log date: at 00:00 a spring-forward day still reports standard time while most of the day is daylight.

**It must never throw.** `Intl.DateTimeFormat` raises `RangeError` on a null or invalid `timeZone`, and `RoadsideDayRender` is the one component where an uncaught exception yields a blank screen in front of an officer, offline, with no recovery. The resolution is wrapped in try/catch and returns the raw stored value on failure; the component renders whatever is present. The §3 guard makes this rare; it must not make it fatal.

Fixtures: winter date, summer date, **DST transition date** (asserting the daylight name), **null zone**, and **`'Not/AZone'`** — the last two asserting the component renders without throwing. The suite runs against an explicit required-field list declared in the test, so a dropped field fails loudly.

**Comment in `rodsValidation.ts`:** on the two transition days the real period is 23 or 25 hours, but the §395.8 grid is 24 boxes and the 1440-minute check is correct *against the form*. Do not make it DST-aware — that breaks certification twice a year and is hours-of-service reasoning we do not perform.

## 7. Offline cache invariants

**Dexie upgrades are additive only.** A comment block in `db.ts` states it: an upgrade may add stores, add indexes, and stamp fields; it may never `.clear()` a store or redefine a primary key, because that rebuilds and drops the only copy of a roadside packet for a driver out of coverage.

**Test (`dexieUpgrade.test.ts`):** open at version 1 via a bare Dexie handle, seed every byte store (a `local_pending_upload` signature, an `uploaded = false` rods PDF, an `eld_document`, a notice PDF), close, reopen through `roadsideDb`, assert every entry survives with `byteLength` intact and the signature keeps `origin: 'local_pending_upload'`.

**Manifest versioning marks stale, never deletes.** A `schema_version` mismatch sets `stale: true` and the packet **still renders from it**; hydration replaces it only on a successful rebuild. `RoadsidePacket` and `CachePacketChip` show "Log list may be out of date — reconnect to refresh."

No Dexie bump is required by this work; any future one obeys this section and ships with the test.

## 8. Officer context and the notice

Hydration selects the frozen `device_provider`, `device_serial`, `discovered_location` into the manifest event. A new `MalfunctionSummaryCard` tops the packet: discovered date/time with tz label, location, provider/make/model/serial, code + description, Day N of 8, and **Open notice** reading `notice_pdfs`.

Two `cacheNotice` gaps close first: cache the notice for the most recent event whether `open` or recently resolved, and re-fetch when `notice_pdf_path` differs from the cached entry's recorded path (the entry gains `source_path`) instead of short-circuiting on existence. The button renders only when `has_notice` is true.

## 9. Manifest — root cause before fallback

Instrument `buildRoadsideManifest`, diff a fresh build against the cached one for the affected driver, and **report** whether the single tile is a stale cache or a builder bug before writing the fallback. The derived-window fallback still ships as defense, records `manifest_fallback_used` with its reason, and surfaces the same visible notice. Never silent.

## 10. Copy

- Heading → `MANUAL RECORD OF DUTY STATUS — ELD MALFUNCTION`
- Sub-line → "Prepared under 49 CFR 395.34(a)(2)–(3). Electronically signed records of duty status per FMCSA regulatory guidance 79 FR 39342 (July 10, 2014), Question 28 to 49 CFR 395.8."
- Banner → "Manual records of duty status"
- Shared strings so PDF and native cannot drift.

## 11. Grid, baseline, label gutter

- `hourLabel` → `MID` / `NOON`, inherited by all three renderers.
- Strip a leading `MC`/`MC-` at render as belt-and-braces; store bare.
- **Baseline:** SVG text uses `dy="0.35em"` (not `dominant-baseline`, for WebKit) and drops the `+2` fudge. `renderRodsDay` gets `y = center - fontSize * 0.35` so both land on `rowCenterOffset`. Screenshot both after.
- `rodsGridGeometry.ts` gains `LABEL_GUTTER_W` and `STATUS_LABEL_LINES` (`['1. OFF DUTY']`, `['2. SLEEPER','BERTH']`, `['3. DRIVING']`, `['4. ON DUTY','(NOT DRIVING)']`). Both renderers derive the label column from it, centering multi-line labels on the row so the duty line stays on `rowCenterOffset`. `GRID_X = MARGIN + LABEL_GUTTER_W`; `LABEL_W` retires. No font shrink.
- Parity test asserts against the longest label: measured width ≤ `LABEL_GUTTER_W`, no label box crosses the grid x-origin, same for the PDF column. A signed fixture asserts the signature `img` renders.

## Technical notes

Two migrations' worth in one delivery: `carrier_profile` create + seed; snapshot columns (including `rods_days.home_terminal_timezone`) + guard replacement. Existing import-graph and bundle tests remain the backstop keeping Supabase out of `/roadside`.
