# Re-investigation — who voided Vino Huddleston's duplicate termination on 2026-09-10

Read-only. Nothing was changed. The earlier conclusion ("no UI voids a termination") holds on the code, but the *origin* of the row is now identified, and it was not a click.

## What the neighbouring writes show

Two writes, ten seconds apart, are the only writes anywhere in the database in that window:

| time (UTC) | table | what |
|---|---|---|
| 13:45:16.105775 | `operator_offboarding_steps` | new row for **Bilal Leggett**, `step_key = lease_termination`, `completed = true`, `completed_by` **NULL**, `metadata = {"backfill": "historical record: lease termination row exists; no DOT notice, ICA still live"}` |
| 13:45:26.964669 | `lease_terminations` | Vino's duplicate `54022680…` stamped `voided_at` + `void_reason`, `voided_by` **NULL** |

Six more `operator_offboarding_steps` rows were created in the same batch, all carrying a `"backfill"` metadata key, all with `completed_by` NULL — the backfill for Trovino, Willie and Bilal.

That batch is the data write of the plan approved that morning ("Deactivating a driver — one path, saved as you go", 2026-09-10). Its technical notes say, verbatim: *"Trovino's duplicate `lease_terminations` row from 09/03 gets a void stamp with a reason; the 09/04 sent one stays."* The void is that statement. It ran unauthenticated, so there was no actor to stamp and no audit row was written — the same reason all seven backfilled step rows have a null `completed_by`.

## What the owner was doing that day

His own authenticated writes on 2026-09-10 are later and clearly his: `operator_offboarding_steps.safety_advisor` completed at **16:23:30** for Trovino and **16:27:55** for Willie, both stamped `completed_by = 5cca4f77-…` (Marcus Mueller). Those are wizard clicks, in Vino's record, in the offboarding flow, with an actor recorded. The 13:45 void is nearly three hours earlier and carries none of that signature.

## 1. Every path that can reach `lease_terminations.voided_at`

Searched all of `src/`, `supabase/functions/`, `scripts/`, and every migration for any touch of the table, including payloads built elsewhere, generic helpers and `updatePayload`:

- `DeactivationWizardContent.tsx:735` — **INSERT** only (signs Appendix C). It reads `voided_at` at line 347 to find the live row and re-reads `insurance_notified_at` at 762. It never writes `voided_at`.
- `send-lease-termination/index.ts:233` — UPDATE of `insurance_notified_at` and `insurance_recipients` only, plus a `lease_termination_sent` audit row.
- `LeaseTerminationBuilderModal.tsx:130`, `LeaseTerminationViewModal.tsx:39`, `TerminationsView.tsx:47`, `DispatchBoardPage.tsx:87`, `OperatorDetailPanel.tsx:1482`, `DriverRoster.tsx:524`, `BulkMessageModal.tsx:304`, `NewDirectMessageModal.tsx:83` — all SELECT.
- No database function writes the table (only `on_ica_amendment_activated` mentions it, and not the void columns). The only trigger is `set_lease_terminations_updated_at`.
- No `updatePayload(...)`/dynamic-key write targets it. No cascade reaches those columns.

So no code path in the app writes `voided_at` on this table. That part of the earlier finding is confirmed by a second, wider search.

## 2. The ICA void specifically

`handleVoidIca` writes **only** `ica_contracts` (`voided_at`, `voided_by = user.id`, `void_reason`), resets `onboarding_status.ica_status`, and inserts an `ica_voided` audit row. It does not touch `lease_terminations`, and no ICA contract was written at 13:45 at all. The one other void control, `ICAAmendmentList.handleVoid`, writes `ica_amendments` and its own audit row. Neither is the source.

## 3. The deactivation wizard end to end

No step voids or supersedes a termination — including `clear_operator_departing` (the step that failed silently until yesterday's fix), which writes `operators` only. The wizard's lease step can create a second Appendix C for a driver who already has one, but it never withdraws the first. That is how the duplicate arose on 09/03–09/04 in the first place.

## 4/5. Verdict

**The path does not exist, and I could not find it because it is not there — but the row is explained.** The void was written by the approved 2026-09-10 backfill data write, not by a control. There is no live defect in which a button voids a legal document without recording who clicked it: there is no such button.

Which leaves the two findings from yesterday standing, now with a named cause for the row:

1. **Bad data from a one-off write** — my backfill stamped `voided_at` and `void_reason` but could not stamp an actor and did not write the `lease_termination_voided` audit row the 2026-08-31 batch hand-wrote. The guard caught exactly that.
2. **There is still no supported way to void a termination.** The withdrawal the business needed on 09/10 had to be done as SQL because the app offers no control for it — while the RLS `ALL` policy (`is_staff(auth.uid())`) would happily let any staff client set `voided_at` with no actor and no audit row, since nothing in the database pairs the two.

## Open question — remedy shape

- Correct the one row (attribute the void to the owner who authorised it, back-write the audit entry marked as a later reconstruction) and leave voids SQL-only.
- Correct the row, then add a `BEFORE UPDATE` trigger that stamps `voided_by` and writes the audit row so any future void is complete however it is issued.
- Correct the row, add a `void_lease_termination(_id, _reason)` RPC plus a staff control in the lease termination area, and narrow the RLS policy so `voided_at` cannot be set directly.

No fix has been applied.
