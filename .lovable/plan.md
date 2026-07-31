## Answer: (c) — there is a live reader the audit missed, and it is an integrity check

Full reader census for `total_off_duty_minutes`, `total_sleeper_minutes`, `total_driving_minutes`, `total_on_duty_minutes`:

**Database** — none. No view or materialized view references them; no `SECURITY DEFINER` or other function references them; the only SQL occurrence is the `CREATE TABLE` in `20260729234627_…sql` (`integer NOT NULL DEFAULT 0`). No column comments exist today.

**Writers (client)** — `RodsDayEditor.save()` (lines 99–104) only. `certify()` does not write them, which is the bug already in the plan.

**Readers (client)** — exactly one live consumer, and it is not the one I named last round:

- `src/lib/eld/offline/divergence.ts`, `TOTAL_FIELDS` (lines 21–26), consumed by `compareKeyedDay()` (line 49). The four totals plus `certified_at` and segment count form the fingerprint that compares the device's cached copy of a certified day against the server's copy. A mismatch is recorded as a divergence, surfaced to the driver, and pins bytes against pruning for 30 days. Covered by `divergence.test.ts`, which asserts a one-minute drift in `total_driving_minutes` is detected.
- `rodsTypes.ts` declares them on the `RodsDay` type; `rodsRenderParity.test.tsx` sets them to 0 in a fixture. Neither reads a value.

**Correction to my previous report:** I said the editor's on-screen totals strip reads the stored columns. It does not — `RodsDayEditor` line 283 renders `validation.totals`, recomputed from the in-memory segments. So the stored columns have *no* display consumer anywhere: not the PDF, not the roadside SVG, not the editor.

**What this means.** Your read is right that the printed federal log was never wrong — every rendered surface derives totals from `rods_events`. But these are not an orphan cache either. They are the integrity fingerprint of a certified day in the offline divergence check, the one mechanism that catches a day certified twice through different paths or a partial write. That makes stale values worse than merely untidy: a day whose stored totals were frozen by the missing `certify()` write carries a fingerprint that does not describe its own segments, so the check is comparing two copies of a stale number and would agree while the actual records differ. Recompute-on-certify is what makes the fingerprint authoritative — so it is load-bearing, not hygiene, though for the integrity path rather than the compliance-output path I originally claimed. I'll label it that way in the migration.

## Added to the plan

Column comments in the same migration as the recompute, so the next reader doesn't file these as dead weight:

```
COMMENT ON COLUMN public.rods_days.total_driving_minutes IS
  'Server-computed sum of driving minutes from rods_events, written authoritatively
   by certify_rods_day. Not rendered anywhere: the PDF (renderRodsDay) and the
   roadside SVG (RoadsideDayRender) both recompute from events. Sole consumer is
   the offline divergence fingerprint (src/lib/eld/offline/divergence.ts,
   compareKeyedDay), which compares the device''s cached copy of a certified day
   against the server''s. Do not drop. Always 0 for record_source = ''eld_document''
   days, which have no events.'
```
…and the equivalent for the other three.

## Everything else unchanged and approved

- `certify_rods_day`: sum the four totals during the existing continuity walk; `RAISE WARNING` tagged `eld_certify_totals_mismatch` (day id, operator id, both sets of four) when the incoming values differ; never raise; write server values authoritatively. The whole block stays inside the existing `record_source <> 'eld_document'` branch, so document days keep their four zeros untouched.
- Client: fold the segment write and the totals write into one `persistDay()` used by both `save()` and `certify()`, which is what makes the mismatch warning a real signal.
- Telemetry: move `stringFallbackHits` into `src/lib/eld/telemetry.ts` as a named-counter registry, re-export from `classify.ts`, register `eld_certify_totals_mismatch`, document the 30-day removal condition in `docs/deferred-removals.md`.
- `buildAmendmentDraft.ts` with `AMENDMENT_RESET_FIELDS`; checked-in `rods_days` column snapshot test, output-shape assertions, reset-set-exists assertion.
- `purge_rods_day` EXECUTE pinning migration, tested from both call paths.
- Round-trip proof from a real `@supabase/supabase-js` client over PostgREST, reporting each `error.code` against `REJECTION_SQLSTATES`.
- Step 4 reporting: per-field `rods_amendments` rows and evidence the deferred continuity trigger fired at COMMIT.
