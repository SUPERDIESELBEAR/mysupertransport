# Offline certification — obligations

Offline certification is not wired up yet. The `certify_rods_day` sync kind,
its handler and its rejection classification exist; nothing enqueues one. This
file records what any future caller owes, so the guarantees the online path has
today are not quietly dropped when the offline path lands.

## AC-1 — a certification always carries a token

One `p_certification_token` per certification *attempt set*, generated once and
reused on every retry. The server treats a replay of the same token as a no-op
and returns the existing row; a fresh token against a certified day raises
P0014. Online this lives in `certifyToken` (a ref in `RodsDayEditor`), so a
timed-out-but-committed RPC can be retried safely. Offline it is the queue entry
id, which `enqueueCertifyDay` derives from the token — the enqueue is therefore
idempotent across app restarts.

## AC-2 — the change record is computed before the queue, never at replay

A queued certification may replay hours later on a device that no longer holds
the superseded log. `p_changes` therefore rides in the payload. The RPC files
the change rows in the same transaction as the certification, so a correction
can never be locked without one.

## AC-3 — a certification is queued only behind a preflight check

`certify_rods_day` locks the row. Anything on screen that never reached storage
is lost the moment it returns, and the signed record then differs from what the
driver signed. Online, `assertPersistedMatches` re-reads the server row and
compares it field for field against the screen. Offline there is no server row
to read, so the comparison is against the Dexie cache — `rods_days_cache` and
`rods_events_cache` — which is the copy the queued certification will replay
from.

This is enforced at runtime, not just in the types: `enqueueCertifyDay` requires
a `PreflightResult` whose `day_id` matches the payload, and throws otherwise.
Reaching `enqueue({ kind: 'certify_rods_day' })` directly bypasses the guard and
is the mistake the wrapper exists to make impossible.

## AC-4 — a mismatch is never resolved automatically

When the persisted copy and the screen disagree, nothing is reloaded and nothing
is overwritten. The driver is shown the differing fields with both values and
chooses: save again, or take the saved version and discard the listed edits.
Auto-reloading would destroy work the driver can see; auto-pushing would hide a
write that failed. Offline, the same dialog applies before the entry is queued.

## AC-5 — header edits are flushed on every exit

Header fields autosave on a shared 700 ms debounce. `flushPendingHeader` runs on
unmount, on `visibilitychange` to hidden and on `pagehide`, because an iOS PWA
can be frozen without another frame. Edits stay in `pendingHeader` until a write
is confirmed — an offline flush returns `'offline'` and keeps them.
## Verification status

Cases (a)–(f) run through the real driver PWA under Chromium. Every case purges
what it seeded in a `finally` block, with amendment children discovered and
purged before the originals they supersede, so a failed run cannot leave
synthetic duty-status records on an operator.

Case (c) — the exit flush — is **verified on Chromium, unverified on iOS
Safari**. Chromium fires `visibilitychange` and `pagehide` reliably under
automation; iOS Safari can freeze or kill a home-screen PWA on paths that fire
neither, and no headless browser reproduces that. It has to be checked on
hardware.

### iOS Safari hardware checklist (case c)

Run on a real iPhone, app installed to the home screen, not in a browser tab:

1. Open a draft log, edit a header field, and within 700 ms of the last
   keystroke press the home gesture to background the app.
2. Wait 60 seconds, then force-quit the app from the app switcher.
3. Reopen from the home screen icon. **Confirm the edit persisted.**
4. Repeat with the screen locked by the side button instead of backgrounded.
5. Repeat with the device in airplane mode: the edit must persist locally and
   sync when connectivity returns.

Record the iOS version and device model with the result. If any step loses the
edit, the debounce is too long for that exit path and the write must move to a
keystroke-synchronous local commit rather than relying on a flush hook.

## Certification replays

`certify_rods_day` returns `replayed: true` when the same certification token
arrives again — a retry after a timeout, or a queued offline entry that already
landed. The original certification and its signature stand; the retry changes
nothing.

Because upload paths are timestamped per attempt (`signature-<ms>.png`,
`log-<ms>.pdf`), a retry uploads new objects the row never references. The
client deletes **only the paths it uploaded on that attempt**, captured before
the RPC call, and asserts that a path being deleted is not `pdf_path` or
`certification_signature_path` on the returned row. Deleting a row-owned path
would destroy the signature on a certified record under 49 CFR 395.8(k)(1).

Purging a day deletes only that row's three explicit paths. It never sweeps by
`<operator_id>/<log_date>/` prefix: an amendment and its original share a
log_date, so a prefix sweep would take the surviving record's artifacts with it.
Unreferenced objects are handled separately by `sweep-rods-orphans`, which is a
reachability check against `rods_days`, not a prefix match, and defaults to a
dry run.

## Purging a record of duty status

**`purge-rods-day` (edge function) is the only authoritative purge path.** It
calls `purge_rods_day`, then removes the row's objects through the Storage API.
The SQL function cannot do the removal itself — `storage.protect_delete()`
blocks direct deletes from `storage.objects` — so it takes a required
`_storage_owner` argument and refuses (`42501`) without one. A bare RPC call
therefore cannot strand a log's PDF and signature in the bucket.

The two-argument overload still resolves but always refuses; see
`docs/deferred-removals.md`.

### Chain-safe ordering

An amendment must be purged before the original it supersedes
(`rods_days.supersedes_day_id` and `rods_amendments.original_day_id` both point
at the original, neither deferrable). `supersedes_day_id IS NOT NULL` is
one-level thinking: in a chain original ← A1 ← A2 it is true for both
amendments and the wrong order hits `23503`. Callers purge only rows nothing
references:

```sql
WHERE operator_id = _op
  AND id NOT IN (SELECT supersedes_day_id FROM rods_days
                 WHERE supersedes_day_id IS NOT NULL AND operator_id = _op)
```

then re-query and repeat, bailing loudly if a pass finds rows but no leaves (a
cycle). `reset-demo-driver` and the Playwright harness's cleanup both use this
loop.

### Storage disposition

Every `rods_day_purged` audit row carries `storage_disposition`:

| Value | Meaning |
| --- | --- |
| `not_applicable` | the row owned no objects |
| `pending_caller` | rows deleted, object removal not yet confirmed |
| `completed` | every recorded path removed |
| `completed_with_failures` | at least one path could not be removed |
| `completed_late` | closed out afterwards by `sweep-rods-orphans` |

A caller that dies between the RPC and `record_rods_purge_storage_result`
leaves `pending_caller` behind, so an incomplete purge never reads as a
complete one. `sweep-rods-orphans` reports those rows as `incompletePurges`
(known orphans — the paths are recorded, not inferred) alongside its
reachability scan, and the **Duty-status storage** card in the ELD admin area
surfaces them.
