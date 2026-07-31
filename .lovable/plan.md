## 1. Purge, with the order settled

### Findings

`rods_days_certified_continuity` is `AFTER UPDATE ON public.rods_days ... DEFERRABLE INITIALLY DEFERRED`. **DELETE is not in its trigger events**, and its body guards `OLD.status = 'certified' AND NEW.status <> 'certified'` — a transition with no DELETE analogue. A purge never reaches it, so `rods.purge` short-circuiting the `BEFORE DELETE` lock trigger is the only gate to clear.

Ordering is constrained by two FKs, neither deferrable, neither carrying `ON DELETE`:

```text
rods_days_supersedes_day_id_fkey      483d81c9 -> f651870e
rods_amendments_original_day_id_fkey  2 rows on rods_day_id=483d81c9 -> f651870e
```

**Order: the certified amendment `483d81c9` first, then the superseded original `f651870e`.** Purging the amendment also removes its two `rods_amendments` rows (matched on `rods_day_id`), clearing the `original_day_id` references in the same statement.

### Execution

Single transaction. Reason string, verbatim on every call:

`Playwright certification-preflight verification run, 2026-07-31 - seeded synthetic RODS data, not a driver record.`

```text
483d81c9  2026-07-28  certified   (amendment — first)
f651870e  2026-07-28  superseded  (original — second)
db6602bb  2026-07-29  certified
d8f8ebaa  2026-07-29  draft
a41c75a6  2026-07-27  draft
a734816b  2026-07-26  draft
e467a31a  2026-07-25  draft
e6c6e6cd  2026-07-24  draft
bdcde985  2026-07-23  draft
```

Starting counts: 9 `rods_days`, 27 `rods_events`, 2 `rods_amendments`, 1 `eld_malfunction_event`, all on operator `ee993ec0`. The malfunction event is deleted separately in the same transaction.

Verification: all four tables at 0 for that operator; exactly 9 new `rods_day_purged` audit rows carrying the reason. Any raise is reported as a finding about `purge_rods_day`, not worked around — Stage 4's demo reset walks the same path.

### Harness

`common.py` gets a `seeded_day(...)` context manager whose `finally` purges unconditionally — pass, fail, INCONCLUSIVE, unhandled exception. It discovers amendment children (`supersedes_day_id = day_id`) and purges them before the parent, asserts per-case counts back to 0, and reports surviving ids loudly on failure rather than swallowing.

## 2. Storage cleanup inside `purge_rods_day` — explicit paths only

**No prefix sweeping.** An amendment and its original share a `log_date`, and the paths confirm it: `RodsDayEditor` writes `${operator_id}/${log_date}/signature-${stamp}.png`. Purging the `2026-07-28` amendment under a `.../2026-07-28/` prefix would delete `f651870e`'s signature and PDF while that row still exists as a retained record under §395.8(k)(1). It is invisible in this cleanup because both rows are going, and permanently wrong in the function and in Stage 4's demo reset.

After the audit insert, before the row deletes, delete from `storage.objects` **only** the three paths the row itself owns:

- `pdf_path`
- `signature_path`
- `source_document_path`

Each is skipped when null. Removed and failed paths are recorded in the audit metadata as `storage_removed` / `storage_failed`. A storage failure is caught into that metadata and never aborts the row purge — the row purge is the compliance-relevant part — but stays visible in the audit trail.

Orphan sweeping is explicitly **not** attached to this. If wanted later it is its own scheduled job doing a reachability check — objects in `rods` referenced by no `rods_days` row across all three path columns — never a prefix match.

## 3. `certify_rods_day` replay flag

`replayed boolean` is added as an additive column on the returned row, not an envelope.

**Server:** returns `replayed = true` when the token matched an existing certification and the call was a no-op.

**`cacheReturnedDay` (`handlers.ts`):** destructure `replayed` off before the `rods_days_cache.put`. It is a property of the call, not of the day, and must not become a phantom field on the local copy of a federal record. It would not trip `compareKeyedDay` (which fingerprints `certified_at`, the four totals, and segment count), but it does not belong in Dexie.

**`HANDLERS.certify_rods_day`:** updated in the same change to read the flag and skip the write-back cost on a replay, so the unreached handler is not left parsing a shape it does not know about. Fixtures updated alongside.

**`RodsDayEditor.certify`:** line 240 currently does `const { error } = await supabase.rpc(...)` and discards the row. Capture `data` so the flag and the guard below have something to read.

- `replayed = false`: unchanged, "Log certified."
- `replayed = true`: *"This log was already certified from your earlier attempt — that certification and the signature you gave then are what is on file."*

**Orphan delete, on replay only.** `stamp` is `Date.now()` computed inside each attempt (lines 173, 215), so paths are timestamped, not deterministic: a retry writes to fresh paths and the row keeps the first attempt's. Confirmed — the orphan is real and the row's paths must not be touched.

- Delete only `sigPath` and `pdfPath` as captured in **this** invocation's local variables, before the RPC call.
- Guard before each delete: assert the path is not equal to `signature_path` / `pdf_path` on the returned row. If it matches, skip the delete and log — that would mean the scheme went deterministic and the "orphan" is the live record's only copy.
- Best-effort and wrapped, so a storage failure cannot turn a successful replay into an error the driver sees.

Also add a line to the certify modal noting a retry completes the earlier attempt rather than replacing it, so re-signing reads as unnecessary rather than as something that was recorded.

## Technical notes

- The signature canvas does **not** clear on ordinary retry — `{certifyOpen && <CertifyDayModal/>}` stays mounted because a failed `certify()` leaves `certifyOpen` true. The clearing seen in the harness was a harness artifact. It does clear on the mismatch path and on Cancel, which are abandonments and correct.
- Case (f) rework and the iOS Safari hardware checklist entry in `docs/eld-offline-certification.md` carry forward unchanged: fulfil `504` after `await route.fetch()`, poll `status='certified'` on a 10 s / 250 ms budget, and report INCONCLUSIVE rather than tapping a second time if it has not committed.
- `purge_rods_day` remains service-role only; the cleanup and the harness `finally` both run in an admin context.
