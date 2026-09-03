# Investigation: equipment serial guard blocking assign / return / archive

Conclusion up front: **the reported diagnosis is stale.** The trigger was fixed on
2026-08-29 and the live function short-circuits before the uniqueness check on every
one of the reported paths. There is also **zero affected data**. Nothing to fix.

## 1. The trigger as it actually is

Migrations defining `enforce_equipment_serial_uniqueness` (repo, oldest → newest):

```text
20260828105444_aa89f414-...sql
20260828105602_8b51a0c5-...sql
20260828111500_equipment_serial_lookalike_guard.sql
20260828124622_9f1b4624-...sql
20260828173217_b1d322ff-...sql
20260829111830_86c0fbb7-...sql   <- NEWEST, read in full
```

Live definition (`pg_get_functiondef`) is byte-equivalent to the newest migration:
`SECURITY DEFINER`, `search_path` pinned to `public, extensions`, `REVOKE`d from
PUBLIC/anon/authenticated.

Live trigger (`pg_get_triggerdef`), enabled (`tgenabled = 'O'`):

```sql
CREATE TRIGGER trg_equipment_serial_uniqueness
BEFORE INSERT OR UPDATE OF serial_number, device_type, status
ON public.equipment_items FOR EACH ROW
EXECUTE FUNCTION enforce_equipment_serial_uniqueness()
```

No WHEN clause. `status` is indeed in the event list, so the trigger *fires* on pure
status transitions — that part of the report is correct.

What it compares, when it reaches the check: another row (`ei.id <> NEW.id`), same
`device_type`, `status <> 'deactivated'`, same `canonical_equipment_serial(...)`.
It raises `unique_violation` with "That device is already on file as % — only
look-alike characters differ."

## 2. Does it fire when the serial is unchanged?

It fires, but it **does not reach the uniqueness check**. Two early exits sit before
the collision query in the live body:

```sql
IF NEW.status = 'deactivated' THEN RETURN NEW; END IF;

IF TG_OP = 'UPDATE'
   AND OLD.device_type = NEW.device_type
   AND public.canonical_equipment_serial(OLD.serial_number)
       = public.canonical_equipment_serial(NEW.serial_number)
THEN RETURN NEW; END IF;
```

That is the exact `IS NOT DISTINCT FROM` guard the item asks about, expressed on the
canonical form plus `device_type`. **The reported diagnosis is wrong against the live
database.** It describes the trigger as it stood between 2026-08-28 and 2026-08-29.
The record already carries this as "The look-alike serial guard blocked its own
cleanup (2026-08-29)", closed, and notes it was latent even then.

## 3. The four callers

| Path | Columns the UPDATE sets | Trigger fires? | Reaches check? |
|---|---|---|---|
| `EquipmentAssignModal.tsx:214` | `{ status: 'assigned' }` | yes (`status`) | no — second early exit |
| `EquipmentReturnModal.tsx:67` | `{ status: condition }` | yes | no — second early exit (or first, if `deactivated`) |
| `equipmentSync.ts` `archiveEquipmentItem` | `{ status: 'deactivated' }` | yes | no — **first** early exit |
| `EquipmentItemModal.tsx:185` | `device_type, serial_number, status, notes` | yes | only when type or canonical serial actually changed — which is the intended case |

The report is over-broad in a second sense: the first three never touch a serial at
all, and the fourth is the one path where the guard is supposed to run.

## 4. What archiving does

`archiveEquipmentItem(item, reason)` in `src/lib/equipmentSync.ts`:
`releaseOpenAssignments(item, 'deactivated', reason)` → `equipment_items.update({ status: 'deactivated' })`
→ `auditEquipment('equipment_archived', ...)`. Callers: `FuelCardDeactivateModal` and
the Edit Device danger zone.

That UPDATE does touch the event list (`status`), so the trigger fires — and hits
`IF NEW.status = 'deactivated' THEN RETURN NEW`. The "blocks its own cleanup" shape
(deactivated excluded as a conflict *target* but not as the *subject*) is **refuted**
on the live definition; the NEW-side exemption is present and is the first statement
in the body.

## 5. Is there real affected data?

**Zero.** Live query over `equipment_items` where `status <> 'deactivated'`, grouped
by `device_type` and the canonical form
(`translate(upper(regexp_replace(serial,'[-. ]','','g')),'OILS','0115')` — inlined
because the sandbox role lacks EXECUTE on `canonical_equipment_serial`): **0 groups
with more than one row.**

Row counts: assigned 144, available 32, lost 13, deactivated 28, damaged 1.

Structurally it cannot arise either — the partial unique index is live:

```text
idx_equipment_items_canonical_serial_uniq
  UNIQUE (device_type, canonical_equipment_serial(serial_number))
  WHERE status <> 'deactivated'
```

So even if the trigger were bypassed, a duplicate pair could not be stored.

## 6. The merge path

`mergeEquipmentItems(survivor, loser, { correctedSerial })` in `equipmentSync.ts`,
driven from `SerialConflictsPanel.tsx` (rendered in the Onboard Systems inventory).
It closes the loser's open assignment, clears that driver's onboarding serial field,
repoints closed history to the survivor, **deletes the loser**, and only then rewrites
the survivor's serial if a correction was chosen — deliberately, so the guard never
sees two live rows on the corrected value.

Reachable from the UI, but moot: with zero conflicting pairs the panel has nothing to
list, so there is nothing needing a workaround.

## Contradictions with the record

None found. The record's 2026-08-29 entry, the live function, the live trigger, the
live partial unique index and the live data all agree. The report contradicts the
record, not the other way round — it should be added to "Reported issues closed as
stale" as fixed-before-report (fix landed 2026-08-29, reported 2026-09-03), with the
note that it was latent even before the fix.
