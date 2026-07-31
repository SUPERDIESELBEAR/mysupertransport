## Citation check, run before re-planning

Fetched the current eCFR text of 49 CFR 395.8.

- **395.8(e)(1)** is quoted correctly: *"No driver or motor carrier may make a false report in connection with a duty status."* (e)(2)/(e)(3) are ELD tampering prohibitions, irrelevant here.
- **It does not support the inference.** It prohibits a false report. It says nothing about correcting a record, annotating a correction, or preserving what changed.
- **395.8(f)(7)** is the on-point provision for re-certification: the driver's signature certifies all entries are true and correct. That is why an amendment must be re-signed. It still does not require a change record.

The written reason and per-field change record stand on **carrier policy alone**, no federal cite attached.

## What I found

**Item 1 — the window is real, and wider than described.** `certify_rods_day` locks the row and returns; `RodsDayEditor.certify()` then calls `record_rods_amendments` as a second round trip. The offline path is worse: `HANDLERS.certify_rods_day` (`src/lib/eld/offline/queue/handlers.ts:98`) calls the RPC and nothing else — **every** amendment certified from the queue files zero change rows.

**Item 2 — three internal 395.30 cites plus one driver-facing claim:** `amendmentDiff.ts:4`, `RodsDayEditor.tsx:194`, `CertifyDayModal.tsx:22`, and `CertifyDayModal.tsx:102` ("Federal rules require a written reason on every correction.").

**Label sources — there are already two.** `amendmentDiff.ts` carries its own `AMENDABLE_HEADER_FIELDS` map, and `rodsHeaderFields.ts` carries the labels the driver and auditor actually see on the form. They disagree today: the form says *"Truck / tractor no."*, *"Total miles driving today"*, *"Trailer no."*; the diff map says *"Truck / tractor number"*, *"Trailer numbers"*. So the change record is already drifting from the form even where it isn't emitting bare column names.

## Plan

### 1. Certify and file the change record in one transaction

New migration replacing `certify_rods_day` with `p_changes jsonb DEFAULT '[]'::jsonb` appended last.

- Immediately before the certifying `UPDATE`, when `v_day.supersedes_day_id IS NOT NULL`:
  - refuse a missing written reason — **P0016**;
  - refuse an empty `p_changes` — **P0017**, "an amendment that changed nothing cannot be certified";
  - validate a non-empty `field_path` on every element, then `INSERT` the rows into `rods_amendments` in the same function body, stamping `operator_id`, `original_day_id`, `log_date`, `reason` from the row.
- Refuse a non-empty `p_changes` on a row with no `supersedes_day_id` — **P0018**.
- Replay stays correct without a guard: both early-return paths (token already present; `unique_violation` recovery) return before the insert block.
- `record_rods_amendments` is dropped.

Register P0016–P0018 in the rule 6 table in `docs/database-security-conventions.md` and in `REJECTION_SQLSTATES` / `CONDITION_GROUPS` in `src/lib/eld/offline/queue/types.ts`.

### 2. Both callers compute the diff before certifying

- `RodsDayEditor.certify()`: compute `diffAmendment(...)` **before** the RPC, pass as `p_changes`; delete the post-certify block, the count guard, and the "certified but the change record failed" path. Keep the pre-certify `amendment_reason` write.
- `handlers.ts` `certify_rods_day`: forward `payload.changes` (default `[]`); the enqueue site in `db.ts` serializes the computed diff into the payload — strings only, so `assertSmallPayload` is satisfied.

### 3. One label source

`rodsHeaderFields.ts` becomes the single authority for header field labels.

- Export a `RODS_HEADER_LABELS: Record<keyof RodsDay-ish, string>` from `rodsHeaderFields.ts`, and rebuild `rodsHeaderFields()` from it so the form and the change record cannot drift.
- Delete `AMENDABLE_HEADER_FIELDS` from `amendmentDiff.ts`; the diff iterates the shared map instead. Columns the diff must cover that the printed header block does not show (carrier name/USDOT/MC, home terminal timezone, the four RECAP lines, `is_reconstructed`) are added to the shared map with the label used on the form, so there is still exactly one source.
- Change record reads **"Total Miles Driving Today"**, **"To"**, **"Truck / tractor no."** — never a column name.
- Update `amendmentDiff.test.ts` expectations to the form labels.

### 4. Citation fix

- `amendmentDiff.ts`, `RodsDayEditor.tsx:194`, `CertifyDayModal.tsx:22`: record kept under 49 CFR 395.8 with the manual-log allowance at 395.34; written reason and per-field change record are **SUPERTRANSPORT carrier policy**. No 395.30 reference.
- `CertifyDayModal.tsx:102`, driver-facing: *"SUPERTRANSPORT requires a written reason on every correction. It is filed with the original log and with a line-by-line record of what changed."*
- Lineage — why the policy exists, that 395.30(c)(2) is the ELD analogue and deliberately not the authority, and that 395.8(e)(1) prohibits false reports but does not require a change record — goes into `docs/database-security-conventions.md`.

### 5. Standing rule 8 in `docs/database-security-conventions.md`

> **Verify through the app's entry point, not the function.** A function proven by direct RPC is not a proven code path. Four defects in this audit share one signature — correct or near-correct code that had never been reached:
>
> - `get_or_create_short_link` — never once succeeded; every binder email/SMS share had been silently falling back to a long URL.
> - `discard_rods_amendment` — raised the message telling the caller to call itself; discarding an amendment could never work.
> - `certify_rods_day` — created, guarded, extended twice, never executed until it was deliberately run.
> - `record_rods_amendments` — worked correctly, called by nothing.
>
> Every one would have passed a direct round-trip proof. "The function is correct" and "the feature works" are different claims and need different evidence. Where a claim is about behavior the app performs, drive the app's real caller. Same distinction that made the driver-session no-op proof worth insisting on over a privileged-path provocation.

### 6. Verification

- Unit: empty-diff case and relabelled expectations in `amendmentDiff.test.ts`; new codes in `rowNotWritable.test.ts`.
- Path-level, per rule 8: Playwright on a demo driver through the real UI — edit a certified log, certify the amendment, assert `rods_amendments` rows appeared with **no** direct RPC from the harness. **Report every `field_path` verbatim as stored**, alongside the label the form shows for the same field, and confirm they match. Then certify an amendment that changed nothing and assert P0017 surfaces in the UI. Then drive the offline queue handler with a serialized payload and confirm rows land from that path too.
- Purge all seeded rows via `purge_rods_day` and report counts.

## Technical notes

- A defaulted parameter changes the signature; PostgREST resolves by supplied argument names, so migration and both callers ship together.
- `rodsHeaderFields.ts` must stay dependency-neutral (it is on the /roadside boot path) — the label map is a plain record, no new imports.
- The deferred continuity trigger (P0042) fires at COMMIT and is unaffected: amendment rows are written in the same transaction as the supersede, before that check runs.
