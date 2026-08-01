# RODS certification — Playwright pass (post local-first refactor)

Chromium headless, 1280×1800, real driver session minted through the staff QR
handoff (`create-preview-session`), demo operator Marcus Mueller. Every case
resets through `reset-demo-driver` and purges in a `finally` through the
`purge-rods-day` edge function (the authoritative path).

Scripts: `/tmp/browser/eld/{common,case_g2,case_a,case_a_realclock,case_a_wait}.py`.

## (g) Direct route to Paper Logs — PASS (regression closed)

Sign in → `/operator/paper-logs` directly, never visiting the ELD tab.

- Dexie after landing: `local_meta: 1`, `roadside_manifest: 1` — the shell-level
  `useRoadsideHydration` in `OperatorPortal` populates the caches on every
  operator route, so hydration is no longer opt-in.
- Opening a day succeeds: the editor renders, no "carrier details have not been
  downloaded" block, and `rods_days_cache` gains the client-minted day.

The pre-refactor finding ("the certification path is unreachable on the direct
route") no longer reproduces.

## (a) Debounce race — the Dexie write is already immediate

With `context.clock.install()` freezing time so the 700 ms timer **cannot** fire,
the final keystroke (`trailer_numbers = FINAL-KEYSTROKE-99`) was present in
`rods_days_cache` immediately after typing. Only the enqueue is debounced; the
cache write is synchronous. Correction 1 from the plan is already satisfied by
the shipped code — no change needed there.

Under a real clock and a long enough wait, that same keystroke reached the
server row intact (`trailer_numbers: "FINAL-KEYSTROKE-99"`). No lost write.

## Defect A (confirmed, blocking) — the preflight reads the server while the draft is still in the queue

**Certification is unreachable for an online driver who does not idle first.**

`assertPersistedMatches` picks its persisted copy on `navigator.onLine`: online
it reads `rods_days` / `rods_events` from the server
(`src/lib/eld/certifyPreflight.ts:81-107`). After the local-first refactor the
draft is written to Dexie and handed to the sync queue; the queue's backstop
tick is 60 s (`INTERVAL_MS`, `queue/runner.ts:150-173`) and nothing in the
certify path waits for it. So at certify time the server has no row yet and the
guard throws `PreflightUnavailableError`.

Reproduction (`case_a_realclock.py`, real clock, no fake timers):

1. Sign in → Logs → open today, fill one 00:00–24:00 Off-duty segment and the
   required header fields.
2. Certify immediately: type the legal name, sign, "Certify log".
3. Toast: *"The saved copy of this log could not be read, so it cannot be
   certified yet. It is no longer on file."*
4. Server `rods_days` for the operator: `[]`. Dexie `local_certified_at: null`.
   No `certify_day` entry was ever enqueued.

Second reproduction (`case_a_wait.py`) isolates the cause to queue latency, not
the debounce:

- Waiting 75 s before certifying lets the `save_draft_day` entry drain
  (`status: "succeeded"`), and the server row then exists with the correct
  header — but the certify path's own `saveSegments` enqueues a **new**
  `save_draft_segments` entry that has not drained, so the preflight fails again
  on the events comparison. `local_certified_at` stays `null`.
- Both queue entries reach `status: "succeeded"` roughly 40–60 s after their
  enqueue, confirming the runner works and the gap is purely the wait.

Neither run produced a `row_not_writable` cancellation, so the debounced enqueue
firing after a lock is not implicated.

**Consequence for the rest of the pass.** Cases (b)–(f) and (h)–(l) all drive a
certification, so every one of them is gated on Defect A. The pass stops here
until the persisted-copy source is fixed.

**Shape of the fix (not yet implemented).** The preflight must compare against
the bytes the certification will actually replay. When the day is unsynced —
`rods_days_cache.unsynced`, or a non-terminal `save_draft_*` entry exists for
the date — the persisted copy is the Dexie cache, regardless of
`navigator.onLine`. The server read stays correct only for a day with no pending
queue work.

---

# Run B — authorized unlock pass, 2026-08-01

Driven against the live preview with a staff session for the Management side and
a driver session for the device side. Unit label `HARNESS-1`.

## What the run verified

- A day flagged `sync_stalled` or `sync_rejected` shows the banner in the day
  editor and in the Logs list, with the date, and **no** sync-state string
  appears anywhere in the `/roadside` DOM.
- `authorizedUnlockDay` clears `local_certified_at`, returns the day to draft,
  bumps the version, cancels the whole chain for that date with
  `cancelled_by: 'authorized_unlock'`, and preserves the document bytes.
- The unlock alert files under the bell's **Action** tab for management and
  owner, and `RodsUnlockEventsPanel` shows it on the driver's Logs view.

## Setup — how the server's event set was made to differ from the device's

This is the reproduction, not a scratch note: it is the mechanism for a real
defect, certification validating against something other than what was signed.

The two `HARNESS-1` days were seeded by **direct insert into `rods_days`** with
`status = 'certified'`, `certified_at` set, and **no rows in `rods_events`** —
totals all zero, `created_at = certified_at = updated_at`. That path bypasses
`certify_rods_day`, which raises `P0023` when the keyed segments for a day do
not tile 1440 minutes and so can never produce such a row itself. The device
then hydrated those dates: `ensureDayCached` wrote a `rods_days_cache` header
and a `rods_events_cache` row whose `events` array was `[]`.

The divergence itself was therefore a test artifact. **The render exposure was
not.** See the register entry below.

## Defect registered — empty event set rendered as a blank certified log

`RoadsideDayView` branched on both Dexie rows merely existing, and
`buildManifestFromCache`'s `localDay` advertised the day as `cached` and
`printable` whenever a PDF was present. An event row holding `[]` satisfied
both, so a day the driver could not produce drew an empty 24-hour grid under a
"Certified" header — the one roadside failure that is not recoverable, because
an officer reads it as "no duty recorded" rather than "not available here".

Writer implicated: hydration (`ensureDayCached`) is the only path that persists
`events: []`. The reconcile in `authorizedUnlock` touches `rods_days_cache`
only and is not implicated.

**Fix.** An event row that is present and empty is treated as an unavailable
day in both places:

- `manifestBuild.localDay` returns `cached: false, renderable: false,
  printable: false` for it, regardless of any PDF on the device — a
  structurally empty certified log makes the PDF for that date equally
  untrustworthy, so it is not offered for print, email-merge or download.
- `RoadsideDayView` re-checks the cache itself, so a stale manifest cannot
  re-open the path, and falls through to the existing "No certified record is
  stored on this device" tile. It does **not** fall back to the PDF embed: on
  iOS Safari that embed is the blank-frame path the native renderer exists to
  avoid, which would swap a blank grid for a blank frame. Gaps are shown, not
  concealed (Stage 3 §10.2).
- Counted separately in `localStorage` under `roadside_empty_event_set`, so the
  driver-side dashboard distinguishes it from `roadside_native_fallback`
  ("hydrated before the structured cache existed", which still serves the PDF).

### It alerts, not just counts

`roadside_empty_event_set` stays as the driver-side counter, but it is no longer
the only signal. The condition now raises a distinct sync alert,
`certified_day_no_segments` (separate from `certified_day_divergence`, which is
two copies that disagree; here there is one copy that cannot render).

The argument for a counter is that the condition should be unreachable:
`certify_rods_day` raises `P0023` for a keyed day whose segments do not tile
1440 minutes, so the server should never hand one over. That is the argument
*for* alerting. A counter on an impossible condition is a counter nobody reads,
and the failure it hides is a driver holding out an "unavailable" tile for a log
he signed. Two live paths still reach it: a direct insert against `rods_days`
(how the harness produced it), and a server-side event delete against an already
certified day.

**Where the guard sits.** Not in `ensureDayCached` — that is only the hydration
writer. Three callers reach the event cache, and a fourth surfaced when the new
required fields broke the build:

| writer | provenance |
| --- | --- |
| `ensureDayCached` (hydration) | `hydration` |
| `commitCertification` | `local_certification` |
| `markDaySynced`'s re-put | `sync_flag_clear` |
| `useRodsDay` (draft create, post-read refresh, segment save) | `editor` |

The chokepoint is `putCachedEvents`, and `provenance` and `day_status` are
required parameters, never inferred: `unsynced` does not identify the caller,
and the input carried no status at all. `local_certified_at` is required for the
same reason — a locally certified day is still `draft` server-side until the
queue drains, so the certification path's empty write is visible only through
it.

**Why detection is a return value.** `putCachedEvents` returns
`{ record, emptySegments }` and stores nothing; each caller passes its own value
to `flushEmptySegmentAlerts` after its own commit. A module-level pending list
was rejected for two reasons worth keeping written down, because it is the
simpler-looking shape someone will reach for again:

1. A transaction that aborts *after* the put would leave the entry in the list,
   and the next caller's flush would raise an alert for a write that never
   landed.
2. Hydration running while a certification commits would share the list, so one
   flush drains the other's entries and attributes them to its own completion.

Scoped to the call, an abort discards the value with the frame and no caller can
drain another's.

The flush is deliberately *after* the transaction, not inside it: `raiseSyncAlert`
enqueues onto `sync_queue`, which the cache-table transactions do not declare, so
an inline raise would throw inside the transaction and take the cache write with
it. `raiseSyncAlert` never throws, so a dead alert path cannot cost the write
either — it lands on the `alert_delivery_failed` counter instead.

Covered by `src/lib/eld/offline/__tests__/emptyEventSet.test.tsx`, including the
local-certification case a guard in `ensureDayCached` would have missed, the
aborted-transaction case, and the interleaved-callers case.

## Cleanup

Both harness rows — `55afece3-ef65-4aa0-a370-701b32e2da05` and
`5f83bace-ac92-46ae-9b48-c9bc00ab052c` — were purged through the
`purge-rods-day` edge function (never a direct delete; the lock trigger refuses
one, which is why the function exists) with the reason:

> Verification-run cleanup: authorized-unlock Playwright pass 2026-08-01,
> harness-seeded certified logs 2026-07-02.

`rods_days`, `rods_events` and `rods_unlock_events` are all empty afterwards,
which closes the demo-mode clean-truncate window: a certified row left sitting
there would be picked up by Stage 4's retention export regardless of the
profile's demo flag.

## Two related fixes shipped with this run

**23514 classification.** A check-constraint violation from
`record_rods_unlock`'s notification insert carried no `status` and no
network-shaped text, so `classifyError` fell back to **`server`** — correct.
What was wrong was the budget: `record_unlock` is cascade-exempt, and the
exemption was being applied to `SERVER_ATTEMPT_LIMIT` as well, so a permanent
error retried forever. The exemption is now **never-dropped, not
never-terminal**: `network` is unbounded for every kind, `server` and
`rejected` are bounded for every kind. `SERVER_ATTEMPT_LIMIT_EXEMPT` is gone.
No `unlock_record_rejected` alert fired at the time because the kind did not
exist; it and `alert_delivery_failed` now do, with `raise_sync_alert` the only
kind that stays console-only (an alert about a failed alert recurses).

**Audit row vs. notification.** The unlock audit insert and the notification
fan-out shared one transaction, so the bad priority value destroyed the record
of an unlock that actually happened. `record_rods_unlock` now writes the audit
row first and attempts delivery in its own exception block, recording the
outcome in `rods_unlock_events.notification_state` /
`notification_error` and continuing. Same principle as storage failures not
blocking `purge_rods_day`: the audit row is the compliance artifact, the
notification is the delivery.

# Run C — read-failure correction + queue cases (l), (i), (k), 2026-08-01

## Correction shipped first: the post-read refresh could fire the alert on a network fault

`useRodsDay`'s refresh read `rods_events` and wrote the result straight into the
event cache. A failed select yields `data: null` → `[]`, which is
indistinguishable from a day that genuinely has no segments. On a certified day
that write both clobbered a good cached set and raised
`certified_day_no_segments` for what was only a dropped connection — the exact
way an alert for an impossible condition becomes an alert nobody reads.

Three changes:

1. **Skip the write on read failure.** `evsErr` now returns early; the cache and
   the screen keep what they had.
2. **New provenance `server_read`.** The refresh is not a driver edit. An empty
   set on that path means the SERVER handed over a certified day with no
   segments — a different fault from the editor producing one, and the detail
   payload now says which.
3. **No invariants asserted as literals.** The refresh and segment-save sites
   pass `localCertifiedAt.current` instead of a hardcoded `null`. Both are
   draft writes by construction today; if a guard regresses, the alert fires
   rather than being argued out of existence by a literal.

Draft-create still passes `null` — it is the one site where the value is not an
assumption: `localCertifiedAt.current` is reset immediately above it.

## Harness: `scripts/eld-queue-gate.py`

Real modules, real browser, real IndexedDB. Modules come in through the Vite dev
server's module graph (`import('/src/...')`), so nothing is exported onto
`window` and no test-only code ships. Every Supabase call is intercepted and
fulfilled at the network layer: all three cases are about what the DEVICE does
on a failure path, and none of them may mutate live compliance rows to find out.

## (l) Queue-side replay after a 504 — PASS

Certify enqueued with this attempt's paths `signature-2000.png` / `log-2000.pdf`.
First drain gets a 504; second gets a `replayed: true` row carrying the FIRST
attempt's `signature-1000.png` / `log-1000.pdf`.

- 504 classified `server`, entry left `pending` with `attempts: 1` — retryable,
  consistent with the retry-budget split from the previous pass.
- Replay drain reached `succeeded`.
- Storage `DELETE` carried exactly the two second-attempt paths.
- Neither `pdf_path` nor `certification_signature_path` from the returned row
  appeared in the delete — rule 2 of `deleteReplayOrphans` holds under a real
  replay, not just by inspection.
- The cache adopted the certified row's paths, so the device points at the
  signature that actually stands.

## (i) Coalescing while an entry is in flight — PASS

Header edit issued against a `save_draft_day` already marked `in_flight`:

- A second entry is created rather than the in-flight payload being rewritten.
- It carries `depends_on: [<in-flight id>]`.
- `dueEntries()` does not offer it while the first is on the wire.
- It releases once the first succeeds, with its own (later) payload intact.

The failure this rules out is the later state being applied first and then
overwritten by the earlier one landing.

## (k) Render failure before the lock — PASS, with one observation

`renderRodsDay` driven with five bad signature inputs: non-data-URL, wrong MIME,
truncated PNG, non-base64 body, empty string.

- No input threw. Each produced an identical 4,498-byte PDF.
- The cached day stayed `locked: false` with `local_certified_at: null`.
- No `signature_images` or `rods_pdfs` rows were left behind.
- No queue entries were created.

So a render fault cannot orphan bytes or half-advance the lock, which is what
the case was for.

**Observation, not a defect here.** The renderer swallows a bad signature and
emits a PDF with the typed legal name over a blank signature line. That is the
right behaviour for `renderRodsDay` in isolation — a signature that will not
embed must not take the document down. It is only safe because nothing on the
certify path can reach it with an unvalidated data URL: the signature is written
to `signature_images` from the canvas and read back as a PNG data URL. If a
future path ever feeds it a signature from elsewhere, the silent drop becomes a
certified log with no visible signature, and the check belongs at that path's
edge — not by making the renderer throw.
