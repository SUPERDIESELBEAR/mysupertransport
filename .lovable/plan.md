## Problem

The duty-status timeline auto-fills gaps. A `normalize()` pass runs on every add, edit, and delete, rewriting each segment's end time to meet the next segment's start (last segment forced to midnight). A driver who opens a gap — by moving a start time later, or deleting a middle entry — has the preceding segment silently stretched across it, carrying that segment's duty status, city, and state.

That is the app inferring duty status and assuming a location on a record the driver then certifies under 49 CFR 395.8(a)(2). Gaps must be rejected, not filled.

Because gaps are structurally impossible today, the `no_gaps` and `sums_to_1440` checks can never fail from the editor. They are dead checks that start doing real work once this changes.

Verified before planning: `rods_days` contains zero rows, so nothing was ever certified under `normalize()` — no contaminated immutable data. Postgres is 17.6, so Stage 1's `NULLS NOT DISTINCT` digest de-duplication is in force. Confirmed on `rods_events`: `duty_status`, `city`, `state`, `end_minute` are all `NOT NULL`, and `is_short_period` is `NOT NULL DEFAULT false`.

## 1. Migration

**Make in-progress segments storable.** Drop `NOT NULL` on `duty_status`, `city`, `state`, and `end_minute`. A gap-fill segment and an unfinished trailing segment both need to save, and drafts must save. `CHECK (duty_status BETWEEN 1 AND 4)` and `CHECK (end_minute > start_minute)` stay unchanged: NULL evaluates to unknown and passes. Completeness moves from a storage constraint to a certification gate.

**`is_short_period`** is computed from duration, undefined while `end_minute` is null. Drop its `NOT NULL` and default. It is written only when both times are present, recomputed on every save, and set back to null if the driver clears the end time — never a stale `false` surviving the driver filling in the end.

**`rods_days.period_start_time`** — does not exist today; midnight is an unrecorded assumption baked into code. Add it:

```sql
ALTER TABLE public.rods_days
  ADD COLUMN period_start_time time NOT NULL DEFAULT '00:00',
  ADD CONSTRAINT rods_days_period_start_midnight CHECK (period_start_time = '00:00');
```

With a `COMMENT` noting that a carrier-designated non-midnight 24-hour period under §395.8 would require offsetting both grid geometry and the 1440-coverage math, and that the constraint makes that assumption explicit rather than untested.

## 2. Server-side certification guard

`canCertify` is client-side and is currently the only thing stopping an incomplete day from being certified. With four columns now nullable, a bug or a direct API call could write a certified day with holes — and certified days are immutable, so there is no repair path.

Enforcement goes inside `certify_rods_day` (SECURITY DEFINER), before it sets `status = 'certified'` / `locked = true`. Skipped entirely when `record_source = 'eld_document'` — those days have no keyed segments by design.

**Segment guard** — raise unless, for the day's `rods_events`:
- No row has a null `end_minute`, `duty_status`, `city`, or `state`.
- Segments tile exactly 00:00–24:00: ordered by `start_minute`, the first starts at 0, each subsequent start equals the previous end, and the last ends at 1440.
- No overlaps (implied by tiling; asserted explicitly so the error names the condition).

**Header guard** — raise unless the `rods_days` row has non-null, non-empty (after `btrim`) values for: `total_miles_driving`, `tractor_number` (or `license_plates`), `carrier_name`, `main_office_address`, `home_terminal_address`, `from_location`, `to_location`, `co_driver_name` (the literal string `None` is a valid answer), `certified_legal_name`, and at least one of `shipping_doc_number` or `shipper_and_commodity`.

**`total_mileage` is deliberately not in the hard guard.** §395.8 explicitly requires total miles driving today; whether "total mileage today" is independently mandated is less clear, and it appears on commercial forms partly by convention. It stays a required field in the client checklist so drivers fill it in, but an unavailable odometer reading must never make a log uncertifiable — a driver who can't certify is a driver who can't be dispatched, which is worse than one blank optional field. `total_miles_driving` stays in the hard guard.

**RECAP fields are excluded** — driver-entered, never validated. Actual column names are confirmed against the live `rods_days` schema during implementation; any spec-name mismatch is resolved in favour of the existing column, not by adding a duplicate.

Error messages are specific (`RAISE EXCEPTION 'Cannot certify: % minutes unaccounted for', ...`; `'Cannot certify: missing required log header fields: %'`) so a client-side bug surfaces legibly rather than as a constraint dump. The client checklist stays as the UX; this is the enforcement.

## 3. End time becomes driver-entered

Delete `normalize()` from `DutyStatusTimeline.tsx`. Sorting by start time stays; the retroactive end-time rewrite goes. Each segment gets its own "Ends at" input beside "Starts at".

**Preserved — data entry at the moment of entry, not inference:**
- "Add change of duty status" defaults the new segment's `start_minute` to the previous segment's `end_minute`.
- On a completely empty day, the first segment created defaults to `start_minute = 0`.

**Removed:**
- No mutation ever rewrites a *different* segment's times. Editing segment 3 touches only segment 3.
- Deleting a segment leaves a hole; no neighbour is extended.
- **The first-segment pin never re-applies.** It is a creation-time default on an empty day, keyed off the day having no segments — not off array index. Deleting the opening segment produces a reported leading gap, never a silent backward extension of the next segment.
- **New segments get a null end time** — not midnight, which would chain the next segment's start to 1440 and be invalid. The last segment alone gets a one-tap **"Ends at midnight"** convenience action.

**Midnight on end times.** Keeps `<input type="time">`; a 96- or 1440-option select would wreck the under-three-minutes-per-day entry target on a phone. Because `end_minute > start_minute` and `start_minute >= 0`, an `end_minute` of 0 is impossible in every case, so the end field resolves `12:00 AM` to **1440** unconditionally. Helper text under the field: *"12:00 AM means midnight at the end of this day."* Start fields resolve `12:00 AM` to minute 0 as before.

**Inverted times.** When `end_minute <= start_minute`, the card shows an inline plain-language error and the day cannot certify. The value is held in local state, not written, so the database CHECK never surfaces as a raw error.

## 4. Validation — three explicit states, no truthiness

The app cannot know whether a segment starting at 08:00 will end at 09:00 or at 24:00. Any gap adjacent to an incomplete segment is **unknowable**, not merely unreported — neither truncating coverage at its start nor excluding it from the scan avoids inventing a gap that may not exist.

**Typing.** `ValidationCheck.ok: boolean` becomes `state: ValidationState` where `type ValidationState = 'pass' | 'fail' | 'pending'`. Not `boolean | 'pending'` — a string union with booleans is exactly what invites truthiness bugs, since `'pending'` is truthy. Renaming the field from `ok` forces every consumer to be revisited at compile time rather than silently passing.

**Consumer audit.** Grep the codebase for `.ok` on validation checks and convert every site to an explicit comparison — `=== 'pass'`, `=== 'fail'`, `=== 'pending'`. Known consumers: `CertifyDayModal` (checklist rows and the submit gate), `RodsDayEditor` (banner), `RodsDayStrip` / day-list status chip, `useRodsDay`, and anything filtering `checks`. `canCertify` becomes `checks.every(c => c.state === 'pass')`, so `pending` blocks certification exactly as `fail` does.

**Checks:**
- **`no_gaps`** — `'pending'` while any segment lacks an end time or a duty status, rendered neutrally as *"Checked once all entries are complete."* No gap list, no gap markers. Once every segment has a start, an end, and a status, the scan runs over all segments and reports **every** gap: structured `gaps: Array<{ start_minute, end_minute, position: 'leading' | 'interior' | 'trailing' }>`, rendered as `Nothing recorded 09:15–11:00, 16:30–24:00`.
- **`sums_to_1440`** — also `'pending'` while segments are incomplete; the total is unknowable for the same reason.
- **`no_overlaps`** — **never pending.** An overlap between two complete segments is real regardless of what else is incomplete. Lists every overlap.
- **`all_segments_complete`** (new) — fails when any segment lacks a duty status, end time, city, or state, and **names the specific missing field per segment**: *"08:00 entry needs a duty status"*, *"13:00 entry needs a city and state"*, *"16:00 entry needs an end time."* It returns structured `incomplete: Array<{ start_minute, missing: Array<'end_time' | 'duty_status' | 'place'> }>` so the UI derives copy rather than restating it.
- **`no_inverted_segments`** (new) — end ≤ start.
- `place_on_every_change` stays; it speaks to changes of duty status, `all_segments_complete` speaks to incomplete entries.
- `total_mileage` remains a client-checklist requirement (`header_complete`) even though the server guard omits it.

**Verification cases:**
- `00:00–08:00`, `08:00–null`, `14:00–24:00` → one incomplete entry, `no_gaps` pending, **no gaps reported**.
- Driver sets the middle end to `13:00` → no incomplete entries, `no_gaps` fails with exactly one interior gap `13:00–14:00`.
- On a complete day with one gap, tapping "Add entry for this period" → the new segment has start and end set and a null status, so the banner reads *"1 entry needs a duty status"* — not "end time."

## 5. Where problems are visible

**Grid** (`RodsGrid.tsx`): hatched red gap bands render **only when the gap scan has run**. While `no_gaps` is pending, no bands are drawn — an absent band must never be read as coverage. Segments with a null end or null status draw nothing. Also fix a related artifact — the vertical status-change connector currently draws at the next segment's start regardless of where the previous one ended. Draw it only when `prev.end_minute === s.start_minute`. Strict `===` performs no coercion, so a null previous end yields `false`; `null === 0` is `false` and no connector can appear at midnight. The plan pins `===`; `==` is never used here, and the comparison never dereferences, so nothing throws.

**Timeline** (`DutyStatusTimeline.tsx`): an incomplete segment shows an inline prompt naming its own missing field — "Add an end time", "Pick a duty status", "Add the city and state" — derived from that segment's `missing` array, never hardcoded. Once all segments are complete, gaps between cards get an inline marker showing the unaccounted span and an "Add entry for this period" button creating a segment with exactly that gap's start and end, null duty status, blank city/state. Leading and trailing gaps get the same marker at the top and bottom of the list.

**Editor banner** (`RodsDayEditor.tsx`): while any segment is incomplete, the banner counts incomplete entries and names the fields, derived from the same structured data — *"2 entries need an end time"*, *"1 entry needs a duty status"*, or *"3 entries are incomplete"* when the missing fields differ. It switches to the unaccounted-hours figure only once every segment is complete.

**Certify modal**: renders `validation.checks` with three visual treatments — pass, fail, and a muted dash for pending.

## 6. One duty-status label mapping

`duty_status` stays integer 1–4 — it matches the numbering on the federal form directly. To keep labels from drifting, add a single exported `dutyStatusLabel(status: 1|2|3|4)` helper alongside `STATUS_LINES` / `STATUS_SHORT` in `rodsGridGeometry.ts`. `renderRodsDay.ts` currently derives its remarks label by slicing `STATUS_LINES[e.duty_status - 1].slice(3)`; that gets replaced with the helper, and Stage 3's cached roadside output must consume the same helper rather than hardcoding its own labels.

## 7. Persistence

`saveSegments` in `useRodsDay.ts` writes segments as-is, so a draft with gaps and incomplete segments now saves — correct, since drafts must be resumable mid-entry. `DraftSegment` widens `duty_status` to `1|2|3|4|null` and `end_minute` to `number|null`; `city`/`state` map empty strings to null on write. `is_short_period` is computed at save time only when both minutes are present, otherwise written as null. Certification is the gate, and it is now closed on both sides.

## Notes

- No hours-of-service math is added. Gap detection is arithmetic on the face of the form.
- Days with `record_source = 'eld_document'` are unaffected — no keyed segments, they bypass the 1440 check, and both new server guards skip them.
- No existing rows to migrate or clean up (`rods_days` is empty).
- Downstream readers of `rods_events` — `statusTotals`, `renderRodsDay.ts`, `RodsGrid` — get null-tolerant handling so an in-progress draft renders without crashing.
