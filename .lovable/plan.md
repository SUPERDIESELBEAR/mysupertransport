## Correction accepted — the baseline runs first

Taking the decision rather than the omission: **run the bypass once against current code**, before the migration ships. A refusal observed only after the fix is indistinguishable from a refusal that was always there for some unrelated reason, and a security finding recorded on a code reading with no demonstration is a claim, not evidence.

The conditions that make it acceptable are the ones you named: `rods_days` is empty (verified this turn), the row is scratch on a demo driver, and `purge-rods-day` removes it along with its events and any amendment children. The uncomfortable part — deliberately producing an invalid certified record — is bounded to a few seconds on a row nobody else can see, and it is the only way the finding is backed by an observation.

### Step 0 — pre-fix baseline (before any migration)

Real `@supabase/supabase-js` client, driver session minted through `create-preview-session` → `redeem-preview-session` → `verifyOtp` on a demo driver, seed/purge in a `finally` block, same discipline as the 2026-07-31 run in §5a:

1. Seed a keyed draft with a **deliberate gap** (e.g. 0–360 and 420–1440) and a header that would also fail — so both the P0021 and P0030 paths are live.
2. Certify it as-is. Expect a refusal; record the code. This proves the guard fires normally on this row.
3. `UPDATE rods_days SET record_source = 'eld_document'` over PostgREST as that driver. Record whether the update returns the row (RLS permits it) or 0 rows.
4. Call `certify_rods_day` again with a fresh token. **Record whether it certifies** — `status`, `locked`, `certified_at` read back from the row.
5. Purge immediately via `purge-rods-day`, then read back `rods_days` / `rods_events` / `rods_amendments` counts to confirm zero, and the `rods_day_purged` audit row.

Outcome recorded verbatim in `docs/database-security-conventions.md` §5a as the demonstration of the hole, whichever way it lands. If step 4 refuses, the finding is downgraded on the spot and the migration is re-scoped to whatever actually blocked it — that result is as valuable as the other one.

## Migration — three layers

**a. `certify_rods_day` refuses anything not keyed.** Remove the `IF v_day.record_source <> 'eld_document' THEN` wrapper so the completeness / gap / overlap / 1440 / header block runs unconditionally, and guard before it:

```
IF v_day.record_source <> 'keyed' THEN
  RAISE EXCEPTION 'Cannot certify: this day is an uploaded ELD document...'
    USING ERRCODE = 'P0019';
END IF;
```

**b. `record_source` immutable after insert** — `enforce_rods_day_lock` (BEFORE UPDATE) raises `P0045` on `NEW.record_source IS DISTINCT FROM OLD.record_source`.

**c. A document row must carry a document** — BEFORE INSERT OR UPDATE trigger raising `P0046` when `record_source = 'eld_document' AND coalesce(btrim(source_document_path),'') = ''`.

Neither b nor c is exempted by `rods.privileged`. Confirmed safe against `replace_rods_document`: it updates only `status` on the superseded row and INSERTs the replacement with a literal `'eld_document'` and a `_new_path` it already refuses blank. Only two `public` functions both update `rods_days` and mention the column — that one and `certify_rods_day`, whose only reference is the branch being deleted. No client update path writes it.

## Step 2 — post-fix provocation, then fixtures

Same session shape as step 0.

- **P0019** — the flip is now refused at the UPDATE (b), so provoke certification refusal by seeding the row as `eld_document` with a valid path and calling `certify_rods_day` on it. Record the verbatim code.
- **P0045** — the flip attempt from step 0, replayed. It is now a live provocation rather than a deferred one, since step 0 establishes it succeeded before; record the code and move it out of the ledger.
- **P0046** — insert an `eld_document` row with a null path. Record the code.
- Re-run the exact step-0 bypass sequence end to end and confirm it no longer certifies, now with a baseline to compare against.

Fixtures are written **after** these observations and assert the observed codes, added to `OBSERVED_CODES`. A code that comes back different from what the migration says it raises means the migration is wrong and gets fixed before any fixture is written.

## Registration and tests

- `REJECTION_SQLSTATES`: P0019, P0045, P0046 — one condition, one function each. §6 code table gets the same three rows; §5a gets the step-0 baseline, the step-2 observations, and the remaining "reachable, not yet round-tripped" list.
- `CONDITION_GROUPS`: decide when writing whether P0045/P0046 read as `locked_record` or want a new `record_source_integrity` group. No overloading a wire value.
- Fixture 17 becomes **"keyed day flipped to eld_document is refused"** against the observed P0019, its note rewritten from "intentional asymmetry" to a record of the bypass, citing the step-0 demonstration. New fixtures for P0045 and P0046; the 1..N numbering assertion grows with them.
- `serverGuardOutcome` loses the `record_source` branch and gains the refusal, so model and wire code keep cross-checking.
- `UNOBSERVED_REACHABLE` ledger: P0016, P0017, P0018 with provocation recipes, plus the test asserting each key is in `REJECTION_SQLSTATES` and asserted by no fixture. Header comment states plainly they are excluded for want of a wire observation, not because they don't matter — they gate every correction to a certified log and are reachable from the driver PWA today.
- `rodsValidation.ts` comment corrected: the checklist is keyed-only because certify accepts nothing else, not because of a deliberate skip.

## Technical notes

- One migration, ordered: `certify_rods_day`, `enforce_rods_day_lock`, then the new trigger function and its `CREATE TRIGGER`.
- The new trigger function adds a `SECURITY DEFINER` entry, so `src/test/definer-live-catalog.test.ts` and `definer-search-path.test.ts` need their MAX counts re-checked against the live catalog and the distinctness assertions re-run.
- No UI behaviour changes.
