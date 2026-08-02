## Goal

Find out why the amendment certification sits at "Signed on this device, syncing" and never reaches the server, report which shape it is, and only then resume step 3. Then close the two recurrences.

## Step 1 — Read the device state (no code changes)

The queue and cache live in Dexie on the device, not in Postgres, so they can only be read from the browser. Drive a headless session for the harness driver (preview-session path, same as step 2), then from the page context dump three things:

**a. `sync_queue`** — every entry: `id, kind, status, depends_on, attempts, next_attempt_at, last_error, last_error_class, coalesce_key, client_timestamp`.

**b. `rods_days_cache` for 2026-08-01** (original and amendment rows) — `local_certified_at, unsynced, version, sync_stalled, sync_rejected`, plus the day ids so the amendment can be told from the original. This is read *first* in the report's ordering: if the banner reads "syncing" while `local_certified_at` is null, the fault is upstream of the queue entirely and the queue entries are a red herring — the certification never committed locally, so nothing was ever enqueued to drain.

**c. `local_meta`** — the carrier record, operator identity, timezone. A missing carrier record blocks creation paths, and the amendment draft was created in that same session, so an incomplete `local_meta` would explain a draft that exists but never produced a well-formed chain.

Then the three discriminators, in the same session:

- **Runner mounted?** `SyncRunnerMount` in `App.tsx` renders whenever `user` is truthy, above the routes, so a preview session should mount it. Confirm empirically: watch for the dynamic import of the `queue/runner` chunk in the network panel and log console output. If the chunk never loads, the runner never started.
- **Dependency block?** `store.dueEntries` skips a `pending` entry unless every `depends_on` prerequisite is `succeeded` (absent = purged success). A `certify_rods_day` whose `save_draft_day` / `save_draft_segments` sits `pending`/`failed`/`rejected` is silently never due — matching a two-minute hold with no error.
- **Kick / backstop?** `startSyncRunner` schedules a 60s `INTERVAL_MS` tick after its first forced pass. Observe whether a second attempt occurs ~60s after load, logging each `drainQueue` entry/exit. First pass never happens → runner. Pass happens but the draft stays `pending` at `attempts: 0` → dependency. `attempts` climbing with a `last_error` → neither, and the error text is the answer.

Report the shape, with all three dumps, **before changing any code**.

## Step 2 — Fix (scoped once diagnosed)

Fix follows the diagnosis; nothing is pre-committed. Then resume step 3 of the §4 walkthrough — amendment certification reaching the server, correction request auto-closing, `resolved_by_day_id` pointing at the amendment.

## Step 3 — Guard: notification priority values

`notifications_priority_check` (migration `20260717202608`) accepts a fixed set; `'high'`/`'normal'` have now been written twice. Add a test under `src/test/` that scans every `supabase/migrations/*.sql`, extracts the allowed values from the latest `notifications_priority_check` definition, finds each `INSERT INTO public.notifications` and each `priority` assignment inside function bodies, and fails on any literal outside the allowed set. Register it in the `test:guards` script. Its header comment states the limit: static literals only, not values computed at runtime.

## Step 4 — Both portals accept both spellings, with a canonical answer written down

Confirmed by reading the code:

- `src/lib/operatorRoutes.ts#getViewStateFromSearch` accepts `tab` first, then `view`, then route aliases (`rods`, `eld`, `doc-hub`).
- `src/pages/management/ManagementPortal.tsx` reads **only** `view` (plus `op`/`operator`, `app`/`application`, `status`, `section`, `event`, `date`). No `tab` alias.

Do both halves:

1. Add a `tab` alias on the management side. Frame it in the code comment as what it is — a **compatibility shim, not a convergence**. It stops a mis-spelled link dead-ending; it does not make the two portals one routing model.
2. Enumerate every writer of a portal deep link — the `send-notification` edge function, the DB notification triggers, in-app `navigate` calls — and verify each against its target.

Then settle the coin flip: record in `docs/database-security-conventions.md` (or a sibling conventions doc, if routing fits better outside the security file) that **`view` is canonical** for both portals, `tab` is accepted only as legacy input and must never be written by new code. Without that line, "both portals accept both" just moves the ambiguity rather than removing it.

## Technical notes

- Nothing in step 1 writes to the database or the repo; it is a read-only browser session.
- The dumps must come from the same origin the app runs on, or Dexie resolves to a different IndexedDB namespace and reads empty — an empty dump from the wrong origin looks exactly like a drained queue and a clean cache.
