# Pass B §9 — acceptance sweep, 2026-08-01

Run as a **verification pass, not a checklist**. Three controls in this pass turned
out never to have shipped (the eld-sync-alert function, §7 throttling, and the
rejection notification's rendered surface — below), so "believed true" is not
recorded here. Every line says what was observed and where.

Evidence classes used:

- **exercised** — something ran and the assertion is on observed output
  (rendered text, drained queue, screenshot). Committed as a test where possible.
- **catalog** — read from a live source of truth (DB catalog, migration applied
  to the project, import graph), not from a code comment or intention.
- **unverified** — no independent evidence was produced this pass. Stated as
  such rather than assumed. These are the ones to look at first next pass.

The criteria list itself lives in the Pass B spec outside this repo; each entry
below is named by its subject so it can be matched back by hand.

---

## Findings

### F1 — the rejection notification never reached the Action tab (fixed)

Predicted shape, confirmed. `raise_eld_sync_alert` inserts a `notifications`
row with `priority = 'high'`. `resolveTier` recognises only
`'action' | 'watch' | 'fyi'`, so `'high'` falls through to the per-type lookup —
and `eld_sync_alert` had **no entry in `NOTIF_TAXONOMY`**. It resolved to
`DEFAULT_META`: tier `fyi`, label "Notification". The row was written correctly
and the bell's Action tab never showed it.

This is the missing-edge-function failure one layer later: a write with no
reader. It is exactly why "the alert row exists" was not accepted as evidence.

- Fix: `src/lib/notifications/taxonomy.ts` — `eld_sync_alert` →
  `{ tier: 'action', category: 'compliance', label: 'ELD Sync Alert' }`.
- Lock: `src/components/__tests__/notificationBellSyncAlert.test.tsx`.

The test asserts on the **rendered** bell: it opens the dropdown, reads the
Action tab's own label for the count `Action (1)`, clicks that tab, and finds
the alert's title in the resulting list. An earlier draft asserted only "the
text appears somewhere in the dropdown" — that version **passed with the
taxonomy entry deleted**, because the All tab shows every tier. The tightened
version was re-run against a temporarily reverted taxonomy and failed on the
`Action (1)` assertion, then passed once restored. A regression test that has
not been observed failing is not a regression test.

### F2 — `ManifestDay.diverged` has no reader on the roadside surface

`manifestBuild` sets `diverged` and `hydrate` maintains it, but neither
`RoadsidePacket.tsx` nor `RoadsideDayView.tsx` references it — grepped, zero
hits. The driver-side strip does render a marker
(`RodsDayStrip.tsx:23,45`), so the flag is live in the app and inert at
roadside.

Observed directly: a manifest seeded with a keyed day carrying
`diverged: true` renders at `/roadside` as an ordinary day — chip reads
"Certified", header reads "CERTIFIED", no marker anywhere (screenshot
`2_diverged.png`).

This is defensible — the local copy *is* the driver's signed record, and a
mismatch with the office copy is an internal review matter, not an officer
matter — but that reasoning is nowhere in the roadside code, and the field
being present in the type invites a future reader to add one. **Not changed
this pass**: showing an officer a "this record is disputed" badge is a
compliance-facing decision, not a UI cleanup. Flagged for an owner call. If the
answer is "deliberately silent", it belongs in a comment next to the day strip.

---

## Focus criteria

### Dependency ordering under a real drain — *exercised*

`src/lib/eld/offline/__tests__/drainOrdering.test.ts`, against a real store on
`fake-indexeddb` (not a mocked queue):

- ordering: sorted by `client_timestamp`, `depends_on` respected —
  `save_draft_day` before uploads, `certify_rods_day` last;
- serialisation: entries processed one at a time, asserted on call order;
- rejection cascade: a terminal class-P0 `rejected` failure drives
  `resolveBlocked`, which cancels the dependent certification instead of
  leaving it `pending` forever;
- classification: a raw SQLSTATE `23505` classes as `server` and stays
  retryable; `P0019` classes as `rejected` and is terminal.

### Rejection path → Management notification — *exercised*, see F1

Alert insertion verified from `raise_eld_sync_alert` (catalog); the **rendered**
bell verified by the test above. The gap was on the render side.

### `/roadside` after everything underneath it changed — *exercised*

Driven headless at 430×900 against the running app, with `local_meta`,
`roadside_manifest` and `rods_documents` seeded straight into the
`superdrive_roadside` IndexedDB, then reloaded:

- the HEIC-converted day renders **in-app** from `display_bytes`
  (`renderable: true`, `display_mime: image/jpeg`) — image drawn, no
  "cannot be displayed" fallback (`1_day1.png`);
- header, carrier line, CFR citation, day strip, and the Print / Email to
  officer / Exit actions all render with no horizontal scroll at phone width;
- day switching works off the strip buttons;
- the diverged day renders — see F2 for what it does *not* render.

Console during the run: no errors beyond React's `forwardRef` ref warnings on
`RoadsideEntry`/`RoadsidePacket` (pre-existing, cosmetic).

### `/roadside` import graph — *catalog*

`roadsideImportGraph.test.ts` continues to assert no Supabase and no pdf-lib in
the roadside entry graph; the officer-email path is a full navigation
(`window.location.href = '/eld/officer-email'`, `RoadsidePacket.tsx:195`), not
an import, which is what keeps pdf-lib out of the offline bundle.

### Definer catalog parity — *catalog*, drift found and fixed

`definer-live-catalog.test.ts` had two stale pins: `create_eld_document_day`
and `replace_rods_document` changed arity in the HEIC migration and lost their
`anon` EXECUTE grants. The allowlist still pinned the old signatures *with*
`anon`. Updated to the live 7-arg and 6-arg signatures with the `anon` entries
removed. The allowlists also assert distinctness, not just length.

### Purge path coverage — *exercised*

`purge-path-coverage.test.ts` fails when `rods_days` gains a `*_path` column
that `purge_rods_day` does not return — the drift guard added after the display
copy was found orphaned.

### Share-token throttling — *catalog + exercised*

60 served opens per hour per token, counted on `outcome = 'ok'` only, so a
throttled caller cannot extend their own lockout. Throttled attempts are still
logged. Migration `20260803000000_refine_share_token_throttling.sql`; behaviour
and the usage table are in `docs/eld-officer-packet-sharing.md`, along with the
live-token near-miss and why the committed test is read-only.

The per-IP counter in `officer-packet-download` is **in-isolate** and therefore
close to decorative — it resets with the isolate and does not coordinate across
them. It is recorded as defence-in-depth, not as a control. The database gate is
the control.

### Throttled screen PII — *exercised*

`/inspect/:token` rendered with the RPC stubbed to `outcome: 'throttled'`. The
card names no driver, carrier, document, or date. The branded header — logo,
wordmark, "Roadside Document Viewer" — is now suppressed in that state only:
it is the one screen an unauthenticated caller can reach that *confirms a token
is live*, and pairing that with the carrier name attributes the link.
`ok` keeps branding (an officer must know whose documents these are) and
"Document Not Found" confirms nothing, so it keeps branding too.

---

## Unverified

Named rather than assumed. Nothing below has independent evidence from this pass.

- **Real-device HEIC capture.** The converted path was exercised with a seeded
  JPEG re-encode; no iPhone-captured `.HEIC` has gone through
  `create_eld_document_day` on a physical device. The decode probe is the
  guard, but the probe itself has only been exercised synthetically.
- **Officer email delivery end-to-end.** Packet assembly, the 4-hour token, the
  429 body, and the download endpoint are each verified; an actual send landing
  in an external inbox is not.
- **Multi-day drain over a real flaky connection.** Ordering and cancellation
  are exercised deterministically; behaviour under genuine intermittent
  connectivity on a phone is not.
- **`/roadside` on iOS Safari.** Verified headless Chromium at phone viewport
  only. Safari is the likely production browser and its IndexedDB eviction
  behaviour differs.
