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