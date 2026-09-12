# Investigation — `parked-and-termination-guardrail` failing on the 2026-09-10 void

Read-only. Nothing was changed.

## 1. The row, in full

- Termination id `54022680-9e26-4133-9c4d-229df62f3deb`
- Operator `28a00800-b6b5-4d60-a709-6e9c26ad7875` — Vino (Trovino) Huddleston, still **active**, not deactivated, not departing, excluded from dispatch
- Created `2026-09-03 20:09:03 UTC`; carrier-signed `2026-09-03 20:09:02` by `2cedd3ac-…` (typed name Marc Mueller); reason `mutual`; effective `2026-09-03`; VIN `1XPBDP9X7GD298070`; never sent to insurance (`insurance_notified_at` null)
- Voided `2026-09-10 13:45:26.964669 UTC` (same value as `updated_at`, so the void was the last write)
- `void_reason` present: "Duplicate: superseded by the 2026-09-04 termination that was signed and sent to insurance. Kept for the record, not in force."
- **`voided_by` is NULL**, and there is **no `lease_termination_voided` audit row** for this termination id. Those are the only two nulls/gaps; every other field is intact.

## 2. How it got that way

There is no writer. Searched all of `src/`, `supabase/functions/`, and every migration:

- No UI control anywhere sets `lease_terminations.voided_at`. The only void UI in the app is `DeactivationWizardContent.handleVoidIca`, which voids **`ica_contracts`** (stamps `voided_by`, writes an `ica_voided` audit row) — a different table.
- No database function touches `lease_terminations` except `on_ica_amendment_activated`, which does not void.
- The only trigger on the table is `set_lease_terminations_updated_at`. Nothing stamps `voided_by`.
- No migration performs any void. Migrations dated 2026-09-09/09-10 that touch void columns (`20260909233723`) only *add* `void_reason`/`voided_by` to a different table. No migration dated around 2026-09-10 writes `lease_terminations` at all.

Conclusion: the 2026-09-10 void was executed as a one-off SQL statement against the table, not through any code path. The six 2026-08-31 voids were also one-off SQL, but that batch stamped `voided_by` = `5cca4f77-…` (Marcus Mueller) and inserted six matching `lease_termination_voided` audit rows. The 2026-09-10 statement did neither.

## 3. Is it a duplicate

Yes, and both rows were real documents:

| | `54022680` (voided) | `e2aac1e3` (in force) |
|---|---|---|
| created | 2026-09-03 20:09 | 2026-09-04 13:31 |
| signed by | `2cedd3ac-…` | `97929f60-…` (Craig Pate) |
| reason / effective / VIN | mutual / 2026-09-03 / `1XPBDP9X7GD298070` | identical |
| insurance notified | never | 2026-09-04 13:31:30, to marc@mysupertransport.com |

Same operator, same terms, generated a day apart; only the second was sent. Voiding the first is the correct business outcome, and `audit_log` independently corroborates both (`lease_termination_signed` for each, `lease_termination_sent` for the second only). The *decision* is legitimate; the *record of who made it* is missing.

## 4. Can the supported path produce this

There is no supported path, so the question resolves into a second finding:

- `lease_terminations` RLS has a single `ALL` policy — `Staff manage lease terminations` using `is_staff(auth.uid())` for both `USING` and `WITH CHECK`. Any staff client can `UPDATE` `voided_at` directly with no actor and no audit row, and nothing in the database would stop it.
- Nothing enforces the invariant the guard asserts: no NOT NULL / CHECK pairing `voided_at` with `voided_by`, no `BEFORE UPDATE` trigger stamping the actor (unlike `20260903174410`, which does exactly that for another table), no audit trigger.

So a void with no accountability is reachable — not by a button today, but by the same table permission the app already grants staff.

## 5. Verdict

**Both of the first two, in this order — and the guard is right.**

1. **The row is bad data from a one-off write and should be corrected.** The void decision is sound and evidenced; what is missing is `voided_by` and the `lease_termination_voided` audit entry. Correcting it means stamping the actor who actually ran the statement and back-writing an audit row that says so, dated as a later reconstruction rather than as if it were written on 2026-09-10.
2. **The writer gap is the real finding.** Voiding a termination has never had a code path, an actor-stamping trigger, or a constraint — the 2026-08-31 batch only satisfied the guard because whoever wrote it also hand-wrote the audit rows. The guard is asserting a genuine invariant that nothing in the database or app enforces.

The guard is not asserting something it should not. Its three checks (reason + actor present, every void audited, every void audit points at a real void with a named actor) are all set-based invariants with no census and no name, and the row they caught is genuinely incomplete.

## Open question for you — remedy shape

- Correct the one row only, and leave voids as a deliberately SQL-only operation.
- Correct the row and add a `BEFORE UPDATE` trigger that stamps `voided_by` from the server-resolved actor and writes the `lease_termination_voided` audit row, so any future void is complete however it is issued.
- Correct the row and add a proper `void_lease_termination(_id, _reason)` RPC plus a staff UI control, then narrow the RLS `ALL` policy so `voided_at` cannot be set directly.

No fix has been applied.
