# Precedence rule + divergence detection for the offline day cache

Scoped to the offline cache write path. No behavior change for drafts or for a normal identical refresh.

## 1. Write the precedence rule down

Add a `PRECEDENCE` block to the doc comment on `ensureDayCached` in `src/lib/eld/offline/ensureDayCached.ts`, and a one-line pointer at the enforcement site in `hydrate.ts` so the guard is traceable to the rule rather than reading as an ad-hoc check.

**Query order matters:** always fetch the certified row for `(operator_id, log_date) WHERE status = 'certified'` **first**, then compare ids. Never query by the cached `rods_day_id` and infer absence from an empty result — with amendments in play, the cached row is set to `superseded` in the same transaction that certifies its replacement.

The rule, in evaluation order:

1. **Local `certified`, `certify_rods_day` not yet succeeded → local wins absolutely.** Never overwritten by hydration, for any reason. The signed PDF and its structured rows are the record; the server has not seen it yet.
2. **No certified row for that date at all** (nothing returned for the date query) → the certification was never applied or was rejected. §4 rejection path, not a cache divergence. A certified row that exists but isn't the cached one falls through to 3/4.
3. **A different certified row exists for the date, and either its `supersedes_day_id` points at the cached row *or* the cached row is now `status = 'superseded'`** → legitimate amendment or document replacement. **Server wins; replace the local copy including bytes.** Not a divergence. A superseded local copy must never keep rendering at roadside, regardless of how the supersession is recorded — so the `superseded` status alone is sufficient even when `supersedes_day_id` is unexpectedly null.
4. **Different id, no supersession relationship and the cached row is not superseded** → genuine anomaly. Flag as divergence, keep both, overwrite nothing.
5. **Same id, local certified and synced → server wins as a refresh, not a replacement.** The day is immutable server-side, so the two should be identical; compare field values (below). Differences are a bug, not a normal state.
6. **Local draft → server wins.**

This applies to **both `keyed` and `eld_document` days** — `replace_rods_document` supersedes exactly as an amendment does, so the document cache path in `cacheDocumentDay` runs the same date-first query and id/supersession check before replacing or flagging.

## 2. Make `certified_at` honest before comparing it

`certified_at` is server-set by `certify_rods_day` at replay time, which for an offline certification is hours or days after signing. Comparing the locally written row against it would flag every offline certification — the primary use case.

Fixed at the source, not in the comparison:

- The `certify_rods_day` queue handler (`queue/handlers.ts`) writes the **row returned by the RPC** into `rods_days_cache` on success, so cache and server match by construction.
- A separate `local_certified_at` field records when the driver actually signed. Retained and displayable, **not** compared.
- Same write-back for the `create_eld_document_day` and `replace_rods_document` handlers.

## 3. Cheap comparison, same-id case only

Compare cached vs. fetched: `certified_at`, the four totals (`total_off_duty_minutes`, `total_sleeper_minutes`, `total_driving_minutes`, `total_on_duty_minutes`), and segment count (`events.length`). For `eld_document` days: `certified_at` and `source_document_path`.

Match → refresh as today. Any difference → do not overwrite; keep local bytes and rows as they are, record the divergence, log both sides to the console.

## 4. Storing and resolving divergences

Additive Dexie `version(4)` in `db.ts` (nothing dropped, cleared, or destructively migrated):

`rods_divergences: 'log_date, operator_id, detected_at, acknowledged'` — local snapshot (day + events; local PDF bytes stay in `rods_pdfs`), server-side values for the compared fields, which fields differed, both row ids, `detected_at`, `acknowledged`, `acknowledged_by`, `acknowledged_reason`, `acknowledged_at`.

Resolution path:

- **Management** resolves from the console, writing `acknowledged` plus who and why (synced via a new queue kind).
- **Driver** may dismiss after Management has contacted them — recorded as a driver-sourced acknowledgement, distinct from a Management resolution. Interim until Stage 4.
- **30-day cap:** an unacknowledged divergence keeps its record but **releases the prune exclusion** after 30 days, since the day is far outside the 8-day roadside window by then.

`prune.ts` excludes a flagged day's PDF and signature only while a divergence is open **and** under 30 days old.

## 5. Surfacing

- **Driver:** `ManifestDay` gains `diverged: boolean`; `RodsView.tsx` / `RodsDayStrip.tsx` render a warning chip — "Needs review: this log differs from the office copy" — with the dismiss action. The roadside render keeps showing the local certified copy; superseded days (case 3) show the replacement, never the original.
- **Management:** one `raiseSyncAlert` with a new kind `certified_day_divergence` carrying operator, log date, both row ids and the differing fields. Fired once per detection, guarded by an existing unacknowledged row for that date.

## Technical notes

- Files touched: `ensureDayCached.ts` (comment only), `hydrate.ts` (date-first query, supersession check, comparison, flag — keyed and document paths), `db.ts` (v4 store, `local_certified_at`, `ManifestDay.diverged`), `queue/handlers.ts` (row write-back on the three RPC handlers), `queue/types.ts` + `store.ts` (ack sync kind), `prune.ts` (exclusion with 30-day release), `queue/alerts.ts` (new alert kind), `RodsView.tsx` / `RodsDayStrip.tsx` (chip + dismiss).
- `ensureDayCached` stays free of Supabase and of comparison logic — it remains the writer; hydration decides whether to call it.
- Tests: identical → refresh; differing `certified_at` on a same-id row → no overwrite + divergence; amendment (different id, supersedes cached) → replaced, no divergence; cached row now `superseded` with null `supersedes_day_id` on the replacement → replaced; different id with no supersession → divergence; no certified row for the date → rejection path; un-synced local certified → untouched; offline certification replayed → write-back leaves no divergence on next hydration; **cross-device: A certifies, B amends and certifies the amendment, A hydrates → A replaces its copy, raises no divergence, does not enter the rejection path.**

After this lands, §7 (notice drain) is next.
