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
