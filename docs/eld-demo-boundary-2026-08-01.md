# Demo boundary run — 2026-08-01

Two gates that had only ever been proven in isolation, now proven on the path.
Operator: `8c0ccadb-d185-4208-846c-0b87c24789da` (`HARNESS-1`, `is_demo = true`),
whose `user_id` is also the session used for the run, so the same identity could
certify as the driver and call the staff endpoints as owner.

## Part 1 — the three-state `is_demo` boundary

Wire calls only: PostgREST + edge functions with the driver's JWT, the same
requests `queue/handlers.ts` makes. No direct SQL writes, so RLS, the
`enforce_record_is_demo` trigger and `certify_rods_day`'s full validation all ran.

| # | Step | Result |
|---|------|--------|
| 1 | `POST rods_days` draft `2026-07-15` (full §395.8 header) | 201 — `is_demo` stamped **true** by the trigger, not by the client |
| 2 | `POST rods_events` — 0–600 off, 600–1080 driving, 1080–1440 on-duty | 201, continuity walk covers all 1440 minutes |
| 3 | `rpc/certify_rods_day` (tokened, `p_changes: []`) | 200 — `status = certified`, `locked = true`, `is_demo = true` |
| 4 | `set-demo-flag { isDemo: false }` | **409** — *"This demo driver has 1 certified demo log. Those records can never become real logs. Reset the demo driver to purge them, then take the account live."* |
| 5 | `reset-demo-driver { scenario: 'blank' }` | 200, `rodsDaysPurged: 1`; `rods_days` for the operator → 0 |
| 6 | `set-demo-flag { isDemo: false }` | **200** — the account can go live only after the purge |
| 7 | `set-demo-flag { isDemo: true }` | 200 — restored to sandbox |

The 409 carries the certified count, so the message is derived from the rows
rather than asserted. Step 6 is the half that matters as much as step 4: the
block is a gate, not a wall — it lifts exactly when the watermarked records are
gone, which is the only state in which a live driver's log set is honest.

## Part 2 — `maybeWipeForDemoReset` against a real stamp

Headless Chromium at `http://localhost:8080/operator`, managed session restored.
Server stamp in play: `demo_reset_at = 2026-08-01T21:16:33.56Z`, written by the
Part 1 reset.

**Load 1 (arming).** The app created `superdrive_roadside` with its real schema;
every store was then seeded directly through IndexedDB — a PDF, a document, a
notice, a signature, a manifest, a cached day and its events, a settled queue
entry, a merged packet, a divergence — plus a `local_meta` holding the stale
stamp `2026-01-01T00:00:00Z`.

**Load 2 (the wipe).** After hydrate:

```
rods_pdfs 0   rods_documents 0   notice_pdfs 0   signature_images 0
rods_days_cache 0   rods_events_cache 0   sync_queue 0
merged_packets 0   rods_divergences 0   pending_mutations 0
local_meta 1        roadside_manifest 1
```

`local_meta` and `roadside_manifest` are both non-zero because hydration rebuilt
them *after* the clear — the meta row carries the freshly fetched carrier
(`SUPERTRANSPORT, LLC` / USDOT 2309365) and, critically,
`demo_reset_at = 2026-08-01T21:16:33.56Z`: the device has recorded the stamp it
honoured.

**Load 3 (idempotence).** Every store re-seeded *except* `local_meta`, then
reloaded. All counts stayed at 1. The stamp is honoured once; the wipe does not
re-fire on every load.

A first attempt at load 3 re-seeded `local_meta` too — reinstating the stale
stamp — and the wipe fired again. That is correct behaviour rather than a
finding, and it is worth recording as the shape of the gate: the device wipes
whenever the server's stamp is newer than the one it holds, and the only thing
that stops a second wipe is the stamp it wrote for itself.

## Final state

`operators.8c0ccadb…`: `is_demo = true`, `demo_label = Harness`,
`demo_reset_at = 2026-08-01T21:16:33.56Z`, zero `rods_days`. Nothing left behind
by the run.