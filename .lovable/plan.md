# Stalled / rejected day: banner + authorized unlock (rev 5)

## 0a. What produces `sync_rejected` on a day the server does NOT hold certified

The proceed path is reachable, and the previous Run B setup was indeed contrived. Reading `certify_rods_day` live plus `classify.ts`, there are two genuine producers:

**1. Certify-time validation refusal — the primary one.** `certify_rods_day` re-validates the day from the `rods_events` rows *as they actually landed on the server*, and raises before it ever writes `status = 'certified'`:

| Code | Condition |
|---|---|
| `P0020` | incomplete duty-status entries |
| `P0021` | gap in the 24-hour period |
| `P0022` | overlapping entries |
| `P0023` | unaccounted minutes |
| `P0030` | missing required header fields |
| `P0016` / `P0017` | amendment with no written reason / no change record |

All are `rejected`-class, all terminal, and **the server row is still a draft afterwards** — the exception fires before the UPDATE. The device meanwhile is locally certified and locked. The reachable trigger is server-side segments differing from the device's: a `save_draft_segments` entry that was coalesced away, cancelled, or landed partially, so the server validates a set of events the driver never saw. That is exactly the state the unlock exists to resolve — a signed, locked, unsynced day whose office copy is an uncertified draft.

**2. `row_not_writable` on a draft write.** `save_draft_day` / `save_draft_segments` filtered by RLS: 0 rows, no error, terminal, `sync_rejected`. Reachable when the row was locked, superseded, purged, or reassigned. Some of those imply certified; the purged/reassigned cases do not.

So: `sync_rejected` does **not** imply a server-certified day. Run B is built on producer 1 — a certify-time validation refusal, driven by making the server's event set differ from the device's — and **`P0022` is once again the expected code, this time for the right reason: overlapping duty-status entries, which is what the live function and `REJECTION_SQLSTATES` both say it means.** The rival-certification mechanism belongs to Run C alone.

## 0b. What separates Run B from Run C (stated at the top of the run doc)

| | Rejection cause | Server row after | Unlock |
|---|---|---|---|
| **Run B** | certify-time validation, `P0022` | still a **draft** | **proceeds** |
| **Run C** | rival certification, second token, `P0014` (same row) or `P0031` (rival draft row) | **certified** | **refuses** |

Both record the SQLSTATE they actually observe rather than the derived one, so the two never collapse into each other unnoticed.

## 0c. Refusal path: reconcile before clearing

`authorizedUnlockDay` re-reads the server row before mutating. If certified, it refuses and, in the same action:

1. writes the server row into `rods_days_cache` through the normal hydration path (server `status` / `locked` / `certified_at` authoritative), `local_certified_at` from the server's `certified_at`, `unsynced: false`
2. only then clears `sync_rejected` / `sync_stalled`
3. marks the terminal certify entry `cancelled` with `cancelled_by: 'server_already_certified'`, retained
4. raises a Management alert — the device believed a certification failed that the office holds as signed

If the reconciliation write fails, nothing is cleared: flags stay, banner stays, the dialog says the check could not complete. Offline or unreadable server row → refuse and say so.

## 1. Flag the day when its chain dies

`markDayStalled(logDate, which)` in `cache.ts`, sole writer. From `runner.ts`: `row_not_writable` / `rejected` → `sync_rejected`; `SERVER_ATTEMPT_LIMIT` exhaustion and `resolveBlocked` cancellation → `sync_stalled`. Exempt kinds never flag a day.

## 2. Banner (driver only, never roadside)

`StalledLogBanner.tsx` in `RodsDayEditor.tsx` and the `RodsView.tsx` list. Rejected wins when both flags are set:

- `sync_stalled`: *"Signed and locked on this device. Not yet received by the office."*
- `sync_rejected`: *"Signed on this device. The office system refused this log — it was not accepted."*

Never at `/roadside`; the packet keeps saying "Certified" with no officer-facing indicator (Pass B §4). A test renders stalled and rejected days into the roadside packet and asserts none of `stalled`, `rejected`, `not yet received`, `refused`, `unlock`, `pending sync`, `not accepted` reaches the DOM.

## 3. Authorized unlock

`authorizedUnlock.ts` + `AuthorizedUnlockDialog.tsx`, required free-text reason naming who authorized it and why, plus an out-of-band acknowledgement. After §0c passes, ONE Dexie `rw` transaction:

1. capture chain entry ids and statuses first
2. clear `local_certified_at`, `unsynced: true`, bump `version`; **leave `day.status` / `day.locked` as the server last reported them**
3. `cancelChainForDay(logDate, reason, { cancelledBy: 'authorized_unlock' })` — new argument on `cancelled_by`; entries cancelled, never deleted
4. clear `sync_stalled` / `sync_rejected`
5. enqueue `record_unlock`

Byte stores untouched; a test asserts `rods_pdfs` and `signature_images` are byte-identical across an unlock.

## 4. `record_unlock` sync kind

Added to `SyncKind`. Handler calls `record_rods_unlock`. Transport failures retry indefinitely; a server rejection keeps the entry and immediately raises a high-priority Management alert (`unlock_record_rejected`), with the runner's exempt-kind suppression narrowed to `raise_sync_alert` only.

## 5. Migration — `rods_unlock_events`

```text
operator_id           uuid not null      -> operators
rods_day_id           uuid               -- NO FK: the day may never have
                                         -- reached the server, and an FK
                                         -- would reject the audit insert
                                         -- exactly when it matters most
log_date              date not null
unlocked_at           timestamptz not null
local_certified_at    timestamptz
cancelled_entry_ids   jsonb not null default '[]'
cancelled_states      jsonb not null default '{}'
reason                text not null
device_info           text
created_at            timestamptz default now()
```
Indexed on `rods_day_id` and `(operator_id, log_date)`. Append-only RLS: driver INSERTs own, management/owner SELECT, no UPDATE or DELETE policy for anyone and those privileges not granted. GRANTs in the same migration: `SELECT, INSERT` to `authenticated`, `ALL` to `service_role`, nothing to `anon`.

`public.record_rods_unlock(...)` — `SECURITY DEFINER`, `SET search_path = public, extensions`, operator from `auth.uid()`, coalesce-positive refuse then `RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501'`, idempotent on a client-supplied key, fires the Management notification.

## 6. Management surface

`RodsUnlockEventsPanel.tsx` in the ELD section of `ManagementPortal.tsx`: driver, log date, unlocked at, reason, cancelled-chain summary. The insert's notification lands in the bell.

## 7. Guards

`record_rods_unlock` into `KNOWN_AUTHENTICATED_EXECUTABLE`, max 64 → 65 as a deliberate diff. All three definer guards confirmed to resolve and pass it. `policy-grant-parity.test.ts` covers the new table.

## 8. Verification — through the app

**Run A — `sync_stalled`.** Fail the PDF upload so certify cascades to `cancelled`. Assert `sync_stalled` true, `sync_rejected` false, banner reads "not yet received by the office".

**Run B — `sync_rejected`, server row still a draft → unlock proceeds.** Make the server's event set overlap (a segment write that lands where the device's coalesced draft did not), let certify run for real, assert the observed SQLSTATE is `P0022`, and assert the server row is still `status = 'draft'`. Banner shows the refusal copy, never "not yet received".

Runs A and B then: `/roadside` carries no sync-state string; unlock with a reason; assert the day is editable with `day.status` / `day.locked` unchanged from the server's last word, chain entries `cancelled` with `cancelled_by: 'authorized_unlock'` and still present, PDF and signature bytes unchanged, one `rods_unlock_events` row with the cancelled ids, and the event in the office bell.

**Run C — `sync_rejected`, server certified → unlock refuses.** Rival certification with a second token, left standing. Record the observed SQLSTATE. Assert the refusal message, the cache reconciled to the server row in that same action, the flag cleared only after that write lands, and no `rods_unlock_events` row. A variant forces the reconciliation write to fail and asserts the flag and banner survive.

Then the full guard suite and `tsgo --noEmit`.
