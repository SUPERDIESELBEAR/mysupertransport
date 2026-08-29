# Fix the look-alike serial guard so it stops blocking its own cleanup

The guard `enforce_equipment_serial_uniqueness` fires on `BEFORE INSERT OR UPDATE OF serial_number, device_type, status`. Because `status` is in that list, every assign, return and archive consults a serial-uniqueness check even though none of them touch the serial. On a row with a near-twin in inventory, all three are rejected — including deactivation, which is the remedy for the duplicate.

No such pair exists in live data today (verified: zero groups under the guard's own canonicalisation), so the defect is latent. The fix is to make the guard consult itself only when the serial can actually collide.

## 1. Skip when the canonical serial is unchanged

On UPDATE, compute `canonical_equipment_serial` of `OLD.serial_number` and `NEW.serial_number`. When they match **and** `device_type` is unchanged, return `NEW` immediately without querying. Status transitions never reach the uniqueness check.

This alone fixes assign, return, archive and every future status path, because none of them alter the serial. INSERT is unaffected — there is no `OLD`, so the check always runs.

`device_type` is included in the early exit condition because the same canonical serial under a different device type is a genuinely new collision surface and must still be checked.

## 2. Skip when `NEW.status = 'deactivated'`

Retiring a row removes it from contention — the guard's own query already excludes deactivated rows as comparison targets. Excluding them as the *subject* too closes the loop: deactivating one half of a duplicate pair is always allowed, whatever the serial says.

Ordering: the deactivation exit is evaluated before the collision query, alongside the unchanged-serial exit.

## 3. The missing unique index

Look-alike uniqueness currently rests on the trigger alone. The index that landed, `idx_equipment_items_canonical_serial`, is **non-unique**; the only unique index is the older `idx_equipment_items_serial_type`, built on the exact form with no `OILS → 0115` translation, so it does not catch look-alikes. Any path that bypasses the trigger — bulk import, restore, direct SQL, `ALTER TABLE ... DISABLE TRIGGER` — can create a pair.

**The canonical expression can carry a unique index against current data.** `canonical_equipment_serial` is `IMMUTABLE` and `SET search_path`-pinned, which is what a functional index requires, and there are zero canonical collisions across 199 rows.

It must be **partial**, matching the trigger's own scope:

```sql
CREATE UNIQUE INDEX idx_equipment_items_canonical_serial_uniq
  ON public.equipment_items (device_type, public.canonical_equipment_serial(serial_number))
  WHERE status <> 'deactivated';
```

Without the `WHERE`, the index would forbid multiple retired rows sharing a canonical serial — which is exactly the state a duplicate cleanup produces, so a total index would re-create the bug at the storage layer. The partial form permits any number of deactivated twins and permits exactly one live device per canonical serial per type.

The non-unique `idx_equipment_items_canonical_serial` becomes redundant and is dropped in the same migration. The older exact-form `idx_equipment_items_serial_type` is left alone — it is a strictly weaker constraint and dropping it is not in scope here.

If the index build fails on data that arrives between planning and applying, the migration fails loudly rather than being weakened; the fallback in that case is to record in `docs/tms-build-status.md` that the trigger is the only enforcement, and resolve the offending pair first.

## 4. Test — the reported defect, written as its case

New `src/test/equipment-serial-guard.test.ts`, following the `stop-time-source-trigger.test.ts` pattern: ambient psql role, everything inside a transaction that is always rolled back, gated through `gatedIt`/`skipBanner` on `PGHOST`.

Because no near-duplicate exists in live data, the test constructs one. With the partial unique index in place a live pair cannot be inserted, so the pair is created as one live row plus one row that the index permits, and the guard's behaviour is asserted against it:

- Insert device A with serial `AABL36UGO24945`, then attempt device B with `AABL36UG024945` (O/zero twin, same type) — **rejected**, both by trigger and by index.
- With the pair forced into place (second row inserted as `deactivated`, which both the guard and the partial index allow), assert against the live row:
  - `update status = 'assigned'` — **succeeds**
  - `update status = 'lost'` (return path) — **succeeds**
  - `update status = 'deactivated'` (archive path) — **succeeds**
- Assert the guard still bites where it should: changing a live row's serial *to* another live row's canonical twin is still rejected.
- Assert self-comparison is not reintroduced: rewriting a row's serial to its own current value succeeds.

Baselines in `src/test/helpers/gate.ts`, `src/test/README.md` and `docs/tms-build-status.md` are restamped together from the measured run.

## Technical details

Migration contents, in order:

1. `CREATE OR REPLACE FUNCTION public.enforce_equipment_serial_uniqueness()` with both early exits added. It carries all four required attributes: `SECURITY DEFINER`, `SET search_path TO 'public', 'extensions'`, `REVOKE ALL ON FUNCTION ... FROM PUBLIC`, and an explicit `REVOKE ALL ON FUNCTION ... FROM anon` — anon is not intended for a trigger function, and `authenticated` is revoked too for the same reason (Postgres checks EXECUTE at `CREATE TRIGGER` time, not at fire time).
2. `DROP INDEX IF EXISTS idx_equipment_items_canonical_serial;`
3. `CREATE UNIQUE INDEX idx_equipment_items_canonical_serial_uniq ... WHERE status <> 'deactivated';`

`canonical_equipment_serial` is not re-authored — it is already correct, already pinned, and already revoked from PUBLIC. Its `IMMUTABLE` marking is load-bearing for the index and must not change.

No table, column, RLS or grant changes. The trigger definition itself is unchanged; the `UPDATE OF ... status` clause stays, since the function now exits cheaply on those events and keeping `status` in the list is what lets the deactivation exemption be evaluated at all.

## Verify

Run the new suite plus `definer-search-path`, `definer-live-catalog` and the full `vitest run --maxWorkers=2`, read output in full, and re-query `pg_get_functiondef` and `pg_indexes` to confirm the live function and the partial unique index match the migration.
