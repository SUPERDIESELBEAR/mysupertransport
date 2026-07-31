## Where the offline preflight requirement gets recorded

Not in a source comment. Three places, only one of which depends on someone reading it:

1. **`docs/eld-offline-certification.md`** — new doc, following the `deferred-removals.md` pattern already in the repo (obligation + trigger, not a date). It holds the acceptance criteria for wiring offline certification, with the preflight as a numbered criterion:

   > **AC-3.** Before enqueuing `certify_rods_day`, the offline path calls `assertPersistedMatches(onScreen, cached)` against `rods_days_cache` / `rods_events_cache` and refuses to enqueue on mismatch, surfacing the same three-way dialog as the online path. Offline is where writes are likeliest to be lost, so the guard matters more there, not less. A change that enqueues a certification without this assertion does not satisfy Stage 3.

   Alongside the rest of the offline-certification acceptance set (byte-caching of PDF and signature, `depends_on`, local certified marking, and the attempt token carried in the payload rather than regenerated).

2. **`mem://features/eld/offline-certification-preflight`** — so the requirement survives into sessions that never open the doc, and is listed in the index.

3. **A runtime tripwire, so it cannot be quietly skipped.** `enqueueCertifyDay` takes a required `preflight: PreflightResult` argument — the value returned by `assertPersistedMatches`, not a boolean — and throws if it is anything but a clean match. A future implementer wiring the offline path cannot compile a call that omits it. This is the part that does not rely on being read; the doc and the memory explain *why* it is there.

The header comment in `certifyPreflight.ts` stays, but as an explanation pointing at AC-3 rather than as the requirement itself.

## Plan

### 1. One token per certification attempt, held in a ref

- `certifyAttemptToken = useRef<string | null>(null)` in `RodsDayEditor`; `certify()` uses `certifyAttemptToken.current ??= crypto.randomUUID()`.
- Every retry of the same attempt reuses it, so line 37's token lookup matches and line 41 returns the certified row, rather than today's **P0014, "Only a draft log can be certified."** (confirmed by reading the deployed function body).
- Cleared only when an attempt resolves leaving the row a draft — validation refusals P0015–P0018, preflight mismatch, offline stop. Not cleared on an unresolved failure (timeout, transport error); that is the case it exists for. Also cleared on `day.id` change so a token cannot cross logs (P0013).
- **No new column.** The editor refetches on mount (`useEffect(… load …, [operatorId, logDate])`) and gates the action bar on `{!locked && !isDocument && …<Button>Certify</Button>}` (line 425), rendering "Open certified log" instead when locked — so a post-reload double-tap cannot occur and a ref fully covers the in-session retry. `pending_certification_token` would have been unnecessary schema surface on a table of federal records, and `AMENDMENT_RESET_FIELDS` needs no change.

### 2. Header flush: classified result, nothing dropped

`flushPendingHeader()` returns `'saved' | 'nothing-pending' | 'offline'`. `pendingHeader.current` clears only after a confirmed write, so transport failure retains the accumulated patch. `'offline'` is classified from a fetch-level failure only — RLS-filtered writes still surface as `row_not_writable`. `certify()` stops on `'offline'`.

### 3. Flush on every exit

`visibilitychange` → hidden, `pagehide`, and unmount all call `flushPendingHeader()`. No `beforeunload`. The two that cannot await fire without awaiting, safe now that a non-completing flush retains the patch. Segments (undebounced) get a dirty-flag navigate-away warning, not a silent autosave.

### 4. Preflight guard

`src/lib/eld/certifyPreflight.ts` exports `assertPersistedMatches(onScreen, persisted)` → differing field labels via `RODS_HEADER_LABELS`, so a mismatch names "Total miles driving today", never a column. Covers every `AMENDABLE_HEADER_COLUMNS` value (derived from the label map, with the assertion test) plus each segment's `start_minute`, `end_minute`, `duty_status`, `city`, `state`, `remarks`, using the diff's null/empty normalisation. Source-agnostic signature; both forms documented, the offline form enforced per AC-3 above. `certify()` runs it after the flush and segment save, immediately before the RPC, and computes the diff from the **persisted** row and events.

### 5. Mismatch: surface both values, never auto-discard

Dialog lists each differing field with both values — *"Truck / tractor no. — on screen: 88, saved: 77"* — offering **Try saving again**, **Use the saved version** (explicit discard), **Cancel** (log stays uncertified, screen untouched). Field list logged for the Management alert either way.

### 6. Verification

- Unit: `certifyPreflight.test.ts` — clean match, header mismatch, segment mismatch, null-vs-empty-string not a false positive, offline form against Dexie entries. `flushPendingHeader` retains the patch on transport failure. `AMENDABLE_HEADER_COLUMNS` equals the derived key set of `RODS_HEADER_LABELS` minus `log_date`.
- Playwright through the real driver UI (rule 8):
  - (a) edit a header field and certify inside the 700 ms window — row and change record agree;
  - (b) offline — offline message, nothing certified;
  - (c) edit, fire `visibilitychange`/hidden, assert persisted with no save tap;
  - (d) **lost write** — `page.route` fulfils the header `PATCH` 200 with an empty array without applying it; assert the preflight refuses, the dialog names the field with both values, on-screen state survives Cancel, `rods_amendments` gained nothing;
  - (e) opposite direction — patch the row out from under the editor; same refusal, same no-overwrite;
  - (f) **double-tap idempotency, with the precondition proven**:
    - the route handler does `const response = await route.fetch()` so the request genuinely reaches the server, then aborts without fulfilling — the server applies it, the client never learns;
    - **before the second tap**, query the row directly and assert `status = 'certified'`, `locked = true`, and `certification_token` non-null. Without this the case cannot tell idempotent replay from ordinary first-time success, and would pass vacuously;
    - after the second tap, assert the returned row's `id` equals the day under edit (not merely that a certified row came back — that is exactly what an amendment-token bug would produce), and that `certification_token` on the row equals the attempt token, proving the *first* call stored it;
    - assert success in the UI rather than P0014.
- Purge seeded rows via `purge_rods_day` and report counts.

## Standing finding — Pass B offline certification is scaffolding

- Seven of ten `SyncKind`s have no live caller; the only `enqueue()` sites are the three in `noticeDrain.ts`.
- `ensureDayCached`'s LOCAL-WINS certification branch, the `certification_rejected` path in `hydrate.ts`, and `row_not_writable` routing *within the queue* are unreachable. (Client-side `row_not_writable` detection on the direct path is live and exercised.)
- Remaining to wire, now captured as acceptance criteria in `docs/eld-offline-certification.md`: enqueue instead of direct-call in `certify()`, the AC-3 offline preflight, the attempt token carried in the payload, and the Pass B §3.1 byte-caching — PDF into `rods_pdfs` (`uploaded: false`), signature into `signature_images` (`origin: 'local_pending_upload'`), both uploads enqueued and `depends_on` from the certify entry, day cache marked locally certified. Out of scope here.
