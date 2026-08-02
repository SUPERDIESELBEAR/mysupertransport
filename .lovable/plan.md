## Finding 1 — the purge exemption is narrow (no change)

`enforce_rods_correction_request_update` permits exactly one thing under `rods.purge`:

```text
NEW.rods_day_id IS DISTINCT FROM OLD.rods_day_id
  AND NOT (v_purging AND NEW.rods_day_id IS NULL)
```

That is the `rods_day_id → NULL` transition only, not "any UPDATE under purge": issue text, requester identity, `requested_at`, `operator_id`, `log_date` and `created_at` stay guarded while the flag is on. `rods.purge` is set transaction-locally (`set_config(..., true)`) inside `purge_rods_day`, which refuses any caller that is not service_role, so a client session cannot assert it. Nothing to narrow.

## Finding 2 — `driver_response` is not append-only

`driver_response` appears nowhere in the immutability list. The status machine blocks a second *status* transition once a request leaves `open`, but a driver can UPDATE only the response text on an already-declined request: no status change, so the machine never fires; `is_own_rods_operator` passes; the trigger stamps `updated_at` and returns NEW. The written refusal is silently editable after the fact. Not caused by the purge exemption — the same invariant, missing on the other half of the row.

## SQLSTATE assignment

The correction-request trigger currently reuses `P0072` (assigned to `discard_rods_amendment` = "not an uncertified correction draft", and mapped to the `not_a_draft` condition group in `queue/types.ts`), and `P0073`–`P0075` sit inside the same `P0070` block. Codes in use today: `P0001`–`P0002`, `P0010`–`P0023`, `P0030`–`P0032`, `P0040`–`P0051`, `P0060`–`P0065`, `P0070`–`P0075`, `P0080`–`P0084`, `P0090`–`P0091`.

Correction requests get their own free block, `P0100`+, and the collision is retired rather than left in place:

| condition | code |
| --- | --- |
| request is append-only (identity/issue/provenance edited) | `P0100` |
| resolution pointer set by hand | `P0101` |
| only the driver may answer | `P0102` |
| already resolved | `P0103` |
| invalid target status | `P0104` |
| decline without a written response | `P0105` |
| **driver response revised after it was recorded** | `P0106` |
| **`resolved_at` altered after it was set** | `P0107` |

`P0072` returns to `discard_rods_amendment` exclusively, so `classifyError` routing on the code alone stays unambiguous.

## Change

One migration replacing `enforce_rods_correction_request_update`:

- Re-code the existing raises to the `P0100` block above.
- `driver_response` write-once: once `OLD.driver_response` is non-null, any distinct `NEW.driver_response` raises `P0106`. NULL → text stays allowed (the decline path).
- `resolved_at` immutable once set → `P0107`.
- Narrow `resolved_by_day_id`: allow `→ NULL` under `rods.purge`, and a real day id only under `rods.privileged`. Purge no longer borrows the broader flag for the null-out.

Client side:

- `src/lib/eld/offline/queue/types.ts` — add `P0100`–`P0107` to `REJECTION_SQLSTATES` with their descriptions; drop `P0072` from any correction-request meaning and leave its `not_a_draft` group membership intact for `discard_rods_amendment`. Add the two new codes to the appropriate condition group (terminal rejection, not retryable).
- `src/lib/eld/correctionRequests.ts` — `declineCorrectionRequest` surfaces the trigger message rather than a raw error string for the new codes.
- `docs/database-security-conventions.md` — update the SQLSTATE table and the observed-verbatim list.

## Pinning the new codes (per standing rule)

The verification run is the provocation; its output is what gets registered, not a one-off confirmation:

1. Against the demo operator over PostgREST as the driver, UPDATE `driver_response` on a resolved request and UPDATE `resolved_at` on a resolved request. Capture the full `PostgrestError` (`code`, `message`, `details`, `hint`) verbatim from each.
2. Add both captures as fixtures in `src/lib/eld/offline/__tests__/parityFixtures.test.ts`, in the same shape as the existing rejection fixtures, so `isRejectionSqlState` and the `REJECTION_SQLSTATES` description assertions cover them. Extend the explicit code list in `rowNotWritable.test.ts` to include `P0100`–`P0107`.
3. Paste the raw JSON envelopes into `docs/database-security-conventions.md` alongside the `P0032` precedent, and move the codes into the "observed verbatim" list.
4. Also pin the legal decline (NULL → text from `open`) as a fixture, so a future trigger rewrite that over-tightens fails loudly instead of breaking the only path that is supposed to work.

## Rest of verification

- Re-run `purge-path-coverage.test.ts`, `parityFixtures.test.ts`, `rowNotWritable.test.ts` and the RODS suite.
- Purge a day carrying a correction request: completes, request survives, both pointers nulled.
- `certify_rods_day` auto-close still sets status/`resolved_at`/`resolved_by_day_id` in one write under `rods.privileged`.
