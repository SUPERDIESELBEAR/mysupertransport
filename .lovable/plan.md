# ELD certification: real alert delivery, the phantom diff, then the failure-path cases

## 1. Alert delivery

`raiseSyncAlert` invokes an edge function named `eld-sync-alert` (`alerts.ts:30`) that does not exist — no directory, no `config.toml` entry. And `supabase.functions.invoke` **returns** `{ error }` rather than throwing on a 404, so the `catch` at line 31 never fires. Every alert below is discarded without a console line.

### Every call site and what it was supposed to tell Management

| Site | Kind | What Management should have learned |
|---|---|---|
| `runner.ts:123` | `log_not_writable` | RLS filtered the write: 0 rows, no error. The driver's edits were dropped; bytes stranded on his device. |
| `runner.ts:136` | `certification_rejected` | The server refused a certification by name — includes the duplicate-date conflict, i.e. another device already certified this date. |
| `runner.ts:149` | `sync_failed` | An entry gave up after `SERVER_ATTEMPT_LIMIT` attempts and is parked for a human. |
| `hydrate.ts:222` | `certified_day_divergence` | Device and office disagree on a certified date — two versions of a signed federal record. |
| `hydrate.ts:404` | `certification_rejected` | Device holds a synced certified log the office has no certified record of. |
| `noticeDrain.ts:247` | `notice_orphaned` | A malfunction notice is past its deferral/age budget and cannot be placed. |
| `noticeDrain.ts:271` | `notice_drain_corrupt` | Cached notice bytes are unreadable; deliberately not deleted. |
| `RodsView.tsx:68` | `certified_day_divergence` | The driver dismissed the divergence warning on his device only; the divergence stands. |

Plus two this work adds: the `record_unlock` server rejection, and the incomplete-purge outcome.

### A. Loud counter

Following `eld_sync_classify_string_fallback` (`classify.ts:22-26`): module counter, stable tag `eld_sync_alert_undelivered`, `console.error` with hits/kind/detail, `resetSyncAlertUndeliveredCount()` test seam. Checks the **returned** `error` as well as a thrown one. Every Playwright case asserts the counter is zero at the end.

### B. `eld_sync_alerts`, delivered through the queue

Table in `public`: `kind`, `operator_id`, `log_date`, `detail`, `raised_at`, `last_seen_at`, `occurrences`, `acknowledged_at`, `acknowledged_by`. Written by a new queue kind `raise_sync_alert`, so an alert raised in a dead zone lands when signal returns.

The write goes through a `SECURITY DEFINER` RPC, not a direct insert — verified reason: the driver is an operator, not staff, and the only INSERT policy on `notifications` is `is_staff(auth.uid())`, so a driver cannot fan out to Management from the client. The RPC inserts the alert row **and** the notification rows in one transaction.

**Ordering trap:** the `raise_sync_alert` handler must never call `raiseSyncAlert`. Its failures report through the loud counter only.

### C. Dedupe on the unresolved condition, not on the event

`(operator_id, log_date, kind)` bounds the queue, which is the right goal, but those columns do not identify an event: two `certification_rejected` alerts weeks apart collapse into one, a `certified_day_divergence` that is resolved and later recurs never reaches Management again, and `log_date` is null for `notice_orphaned` and `notice_drain_corrupt`, so those dedupe on `(operator_id, kind)` alone — one notice-corruption alert, ever.

So: suppress **only while an existing row with the same key has `acknowledged_at IS NULL`**. Once Management acknowledges, a recurrence raises a fresh alert and a fresh notification — a condition returning after it was handled is a stronger signal than the first occurrence, not a weaker one.

- Partial unique index on `(operator_id, coalesce(log_date, '1900-01-01'), kind) WHERE acknowledged_at IS NULL`, so the "one open alert per condition" rule is enforced by the database, not by a read-then-write race on a flaky connection.
- On a suppressed raise the RPC bumps `last_seen_at = now()` and `occurrences = occurrences + 1` on the open row, so a repeating unresolved condition reads as repeating rather than as one stale entry. The bell item shows the occurrence count and the last-seen time.
- The queue entry for a suppressed raise still succeeds — a bump is a successful delivery, not a failure.

### D. Hardening the fan-out RPC

A new SECURITY DEFINER function inserting into `notifications` on behalf of a caller with no INSERT policy there, so all three recorded conventions apply:

- `SET search_path = public, extensions`, with any extension call schema-qualified (`docs/database-security-conventions.md`).
- Caller check as a **positive refuse** with every operand `coalesce`d — never `IF NOT (...)`. `purge_rods_day`'s gate failed open on a NULL claim; here the failure mode is a driver fanning arbitrary notifications out to staff.
- **Ownership verified server-side, not from the payload:** the function resolves the caller's operator via `auth.uid()` and refuses unless the `operator_id` argument matches.

Confirmed both convention tests pick it up with no naming: `definer-search-path.test.ts:30-36` and `definer-fail-open.test.ts:29-35` enumerate every migration past their `CUTOFF` and regex out every `CREATE FUNCTION ... $$ ... $$` block.

### E. Cascade exemptions — `raise_sync_alert` alongside `record_unlock`

Several alerts describe the chain that just failed, and `cancelChainForDay` today cancels every non-terminal entry for the day — including the alert reporting why. One exported `CASCADE_EXEMPT_KINDS = new Set(['record_unlock', 'raise_sync_alert'])` in `types.ts`, applied at all four points:

1. **Transitive cascade** — `resolveBlocked` (`store.ts:187-213`) skips exempt kinds when collecting `doomed`.
2. **Dead-prerequisite rule** — an exempt entry is never cancelled for a terminal prerequisite.
3. **Drop-on-rejected** — `cancelChainForDay` (`store.ts:220-234`) filters exempt kinds out of `mine`.
4. **Budget exhaustion** — the `SERVER_ATTEMPT_LIMIT` path (`runner.ts:147`) does not park an exempt entry as `failed`.

Transport failures retry indefinitely; a server rejection **keeps** the entry and reports through the loud counter — the only channel that cannot depend on itself.

### F. `purgeSucceeded` retention and the driver's sync chip

**Purge retention: confirmed already safe.** `purgeSucceeded` (`store.ts:279-295`) builds `stillDependedOn` from the `depends_on` arrays of non-terminal entries. Alert entries are enqueued with `depends_on: []` and nothing lists an alert as a prerequisite, so an alert neither retains nor is retained. A unit test pins it.

**The reverse risk gets fixed.** `syncCounts` (`store.ts:305-314`) counts every entry by status, so a rejected alert — kept forever by design — would sit permanently in the driver's chip as "1 change waiting to sync," for something he cannot act on. `syncCounts` excludes `CASCADE_EXEMPT_KINDS`: office-facing records, not the driver's work. The chip reflects what the driver is waiting on.

### G. The surface a human actually looks at

The **`notifications` table**, read by `NotificationBell` (`src/components/NotificationBell.tsx`), mounted in `StaffLayout` and polled by `ManagementPortal.tsx:361` — the bell already in the management header with Action/All/Mentions tabs.

What a Management user sees: a new **unread count on the bell** and an item in the **Action** tab, in the same triage row shape as every other actionable notification — titled by kind ("Certification rejected — Flint Alexander, 2026-07-28"), `detail` as the body, occurrence count and last-seen when it has repeated, deep-linking to that driver's Logs. It also appears in the Notification History two-pane list. Acknowledging writes `acknowledged_at`/`acknowledged_by` back to `eld_sync_alerts`, which is what re-arms the dedupe.

### H. Until B-G exist, no flow is described as notifying Management

Several comments already do — `runner.ts:119-120` among them. Corrected in the same change.

## 2. The `period_start_time` phantom

There are not two screen snapshots: `certify()` builds one `onScreen` object (`RodsDayEditor.tsx:156-167`) and the dialog renders `err.differences`, the array the comparison produced. What differs is the row's shape across its lifetime — the mint at `useRodsDay.ts:193-205` omits `period_start_time`, the column is `time NOT NULL DEFAULT '00:00:00'`, and every server round trip returns `"00:00:00"`. Of all `AMENDABLE_HEADER_COLUMNS` it is the only one with a server default the mint omits.

- **One constant.** `export const RODS_PERIOD_START_DEFAULT = '00:00:00'` in `rodsTypes.ts`, imported by `newLocalRodsDay()` and `putCachedDay`'s defaulting. The migration cannot import it, so the column-guard test asserts the constant equals the column's actual default read from the schema — all three agree or the test fails.
- **New mints:** `newLocalRodsDay()` seeds every server-defaulted column the diff can see, with a column-by-column test asserting a fresh mint diffs empty against a server-shaped row.
- **Existing cached drafts: normalised on read.** Dexie v6 uses `Collection.modify({ period_start_time: RODS_PERIOD_START_DEFAULT })` on rows missing it — a field modify, never a whole-row put, which would erase `unsynced`, `version`, `local_certified_at`, `sync_rejected`, `sync_stalled`: the defect at `ensureDayCached.ts:110-115`, reintroduced by the migration meant to clean up after it. Upgrade test: a row with `unsynced: true` and a `local_certified_at` survives with both intact and every other field byte-identical.

Case (e) gains: the diff lists **exactly one** row, `Trailer no.`, `Saved: TAB-B-EDIT` / `On screen: TR-55`.

## 3. Case (b) — retired

Every clause of a repointed (b) is already covered by (h) H1-H6 and (j). Retired with the clause-by-clause record in `docs/eld-certification-playwright-run.md`.

## 4. Case (m) — reseeded with service role

The anon REST `42501` is recorded as a small positive result: anon cannot write `rods_days`. Reseed via service role; the conflict is structural (`rods_days_one_certified_per_date`). Assert: terminal state carrying the violation, the chain resolves rather than retrying forever, the Dexie entry marked rejected with the local copy **not** discarded, the driver sees it in the day editor and Logs list, `raiseSyncAlert` asserted at the call site, the `eld_sync_alerts` row plus the management notification, a second raise before acknowledgement bumping `occurrences` rather than creating a row, the alert entry surviving the day's chain cancellation, and the driver's sync chip not counting it.

## 5. Cases (i), (k), (l)

**(i) coalescing under `in_flight`.** Stall the `rods_days` upsert, edit a header field mid-flight, release. Assert both entries drain, later value wins, nothing stranded `in_flight`, expired budget still terminal.

**(k) render failure before the lock.** No network dependency in `renderRodsDay` (`StandardFonts`), so inject where a real corrupt signature would enter: override `HTMLCanvasElement.prototype.toDataURL` to return a malformed PNG so `embedPng` throws — before `commitCertification`.

The orphan assertion stays as a regression guard. `commitCertification` writes the signature with `origin: 'local_pending_upload'` inside its own transaction (`commitCertification.ts:123-131`), and `pdfBytes` is an argument, so the render at `RodsDayEditor.tsx:203` completes before any bytes are cached. But `prune.ts:60` skips `local_pending_upload` unconditionally, so if a future change caches the signature before the render, an abandoned attempt leaves bytes nothing references and nothing removes. If it fails, the fix is a cleanup on the failure path, never a relaxation of the prune rule.

Assertions: error toast, `local_certified_at` still null, zero queue entries, day still editable, no bytes in `rods_pdfs` or `signature_images`.

**(l) queue-side replay.** Attempt one must genuinely commit: the route forwards with `route.fetch()`, waits for the real response, then returns `504`. Same token retries, RPC returns `replayed: true`. Assert `replayed: true`; exactly `signature-<t2>.png` and `log-<t2>.pdf` removed and nothing else; the row's `pdf_path` and `certification_signature_path` unchanged **and both still resolving to real, non-empty Storage objects** after cleanup; attempt two's keys gone; the "path is on the certified row" warning does not fire.

## Order

1. Loud counter (1A).
2. `eld_sync_alerts` + condition-scoped dedupe + hardened fan-out RPC + queue kind + cascade exemptions + `syncCounts` exclusion + bell fan-out (1B-G); correct the overclaiming comments (1H).
3. `RODS_PERIOD_START_DEFAULT`, `newLocalRodsDay`, column guard, Dexie v6 `modify` + upgrade test; re-run (e).
4. Retire (b), write both run-doc entries.
5. (m) reseeded.
6. (i), (k), (l).

## Files

`src/lib/eld/offline/queue/alerts.ts`, `types.ts`, `store.ts`, `runner.ts`, `handlers.ts`, `src/lib/eld/rodsTypes.ts`, `src/hooks/useRodsDay.ts`, `src/lib/eld/offline/db.ts`, `src/components/NotificationBell.tsx`, five unit tests (column guard, v6 upgrade, cascade exemption, purge retention, dedupe re-arm), `docs/eld-certification-playwright-run.md`, and one migration for `eld_sync_alerts` + the fan-out RPC. Harness stays in `/tmp/browser/eld/`.
