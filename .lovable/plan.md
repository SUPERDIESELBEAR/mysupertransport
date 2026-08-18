# SUPERDRIVE — ELD Malfunction Mode: tap-to-change driver redesign

Replaces the driver-facing entry surface only. Everything in §1 of the spec (certify_rods_day and its guards, commitCertification, the sync queue, renderRodsDay, the roadside packet, signature validation, the malfunction notice PDF and email, amendments, all of Stage 4) is untouched.

## 1. Report a malfunction — one screen

`ELDMalfunctionWizard.tsx` (398 lines, 4 steps) becomes one scrolling screen:
When (defaults to now, editable) · Where (town chip, editable) · Device (prefilled from the truck's assigned ELD model/serial) · What's wrong (seven FMCSA codes as plain-language options + required free-text) · "Does this stop your ELD recording your hours?" Yes/No.

Submit does exactly what it does today — same record, same notice PDF, same carrier email, same office notification — then lands the driver on today's log with no confirmation step. Answering No records the malfunction and states manual logs aren't required.

## 2. Prior seven days — a sentence

`ReconstructionWizard.tsx` is deleted and replaced with one paragraph: the last 7 days are in Motive, federal rules only require recreating records you don't have, show Motive to an officer, SUPERDRIVE takes over from today. One link back.

`UploadEldLogModal.tsx` ("I already have this day from my ELD") is deleted from the driver app and not moved to staff — there is no staff caller today, and building one now would be speculative.

Both RPCs are then dropped, because the database says they are unreachable in every sense: `rods_days` holds **one row in total and zero with `record_source = 'eld_document'`** — no production document rows exist, demo or otherwise.

- `replace_rods_document` — dropped. It only replaces a document on a row type that has no rows and can no longer be created.
- `create_eld_document_day` — dropped as well. Its plausible future is a staff-side filing path nobody has asked for, and a definer function nothing reaches is exactly the shape that drifted out of sync with the schema around it before.

Both drops are recorded in `docs/deferred-removals.md` with the reason and the row count that justified them. The **schema support stays**: `record_source`, the `eld_document` CHECK value, and the P0019/P0045/P0046 guards are untouched, so a future staff filing path is additive — one migration re-creating one function, not a schema change. The `definer-live-catalog` pins for both go in the same change.

## 3. Today's log — tap-to-change

Four large buttons in federal order: 1 OFF DUTY · 2 SLEEPER BERTH · 3 DRIVING · 4 ON DUTY (NOT DRIVING). The active one shows elapsed time counting.

A tap stamps the change at now and offers a town chip to accept or overwrite. A status runs until the next tap, so the day totals 24 hours by construction.

**Midnight split** — a status still running at 00:00 closes the day and opens the next day at 00:00 with the same status. Automatic, no prompt.

Below the buttons, the day's changes as a plain list (`06:00 On duty · Pleasant Hill, MO`). Tapping a row lets him **move the boundary** (constrained between neighbours), **insert a missed change**, or **delete one entered in error** (equal neighbours merge, otherwise the earlier extends). Every correction screen has an explicit Save.

The §395.8 grid renders below as output, pinch-zoomable, never an input.

Removed because the state cannot exist: gap detection, the `pending` validation state, hatched bands, "N hours unaccounted". `assertPersistedMatches` stays as a silent guard; if it ever fires the driver gets a plain "this log changed elsewhere — reload" instead of the two-way mismatch dialog.

## 4. Location — typed path first, GPS on top

Built and proven in this order:

1. **Quick-pick chips** of towns already used today (most taps are one tap, no network), free text with a 2-letter state picker, and recent towns from the last few days as suggestions. This works standalone and offline — it is the floor, not a fallback.
2. **Then** Google Geocoding on top, pre-filling the chip only. Last resolved position cached so a repeat tap in the same place doesn't re-query; debounced. Any failure, timeout, or offline device falls through silently to the chips — no spinner, no error, never a blocked tap.

Only the text the driver accepted is stored. No coordinates on the record, no automatic write. Before the key is switched on I'll report expected calls per driver-day and cost at fleet scale; the geocoder stays off until you approve that number.

## 5. Trailer and BOL — two fields, once a day

Camera first: tap, shoot, done — the photo is attached as supporting evidence. Immediately after, with the photo on screen, one short field asks for the shipping document number he is reading off it. Skipping is accepted, but then shipper and commodity must be supplied instead, because §395.8 takes either as text and `certify_rods_day`'s header guard checks for it. The certify checklist says which one is missing in plain words rather than naming a column. The typed field is never hidden — a photo alone would print a blank where the regulation wants a value. Trailer number stays one field.

## 6. Certification reminders — relaxed, and the blind spot closed

`rods-certification-reminders` keeps running as the backstop for a driver who never reopens the app, but only fires for a day uncertified 24h+, so normal rollover certification never triggers it. The reconstruction-incomplete branch goes away with the wizard.

The job reads Postgres only and cannot see `local_certified_at`, so a signed-but-unsynced day currently gets nagged (the code says so at index.ts:93). Fix: skip any day with an open `eld_sync_alerts` row — that is server-side and reachable, and the stalled banner already tells the driver and the office. The job already resolves each operator's `home_terminal_timezone`; I'll add the demo-operator exclusion, which it does not have today. I'll also report whether it has ever actually fired.

## 7. Three driver-app defects

1. Scroll position reset to top on every navigation.
2. Explicit Save on time entry (covered by §3).
3. Re-walk the driver app afterwards and report anything else unresponsive.

## Technical notes

- Entry state stays `rods_events` with `start_minute`/`end_minute`; the tap model just guarantees each event's `end_minute` equals the next event's `start_minute` or 1440, so tiling is satisfied by construction rather than by validation.
- New shared module for boundary maths (insert / move / delete / midnight split) with unit tests, so the invariant is tested independently of the UI.
- `useRodsDay`'s local-first Dexie write path and single-writer queue discipline are reused unchanged; taps write through `saveSegments`.
- Dead-reference report after the deletions: `ReconstructionWizard.tsx`, `UploadEldLogModal.tsx`, `CertifyMismatchDialog.tsx`, the reconstruction branches in `RodsView.tsx`, gap/pending paths in `rodsValidation.ts`, and the `definer-live-catalog` pins for `create_eld_document_day` / `replace_rods_document` (which lose their last callers — the RPCs stay, with no caller, and I'll state that plainly rather than leave it implied). The queue already has no handlers for either.
- I will confirm the roadside packet and the retention export still render an existing `eld_document` row after the driver-side removal.

## Verify

Malfunction report plus first status change under 60 seconds; six changes in a day under 90 seconds; day totals 1440 with no validation prompt ever shown; forgotten-tap boundary move, insert, and delete all still total 1440; midnight split produces two valid days; rollover certification is one screen; `test:guards`, the ELD suites, and roadside packet rendering of a day created this way all pass.
