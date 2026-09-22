# Agreement status forward-only — P36, and today's two jobs (2026-09-22 11:00 UTC)

Nothing real was touched. Both proofs ran on throwaway rows inside a transaction that raised
at the end and rolled back; the job verification was read-only.

---

## Step 1 — the bypass, confirmed live

Throwaway driver and a throwaway agreement at `sent_to_operator`, `linehaul_split_pct` 72,
admitted as Leo Wallace (dispatcher, `7d80cc10-…`) on the `authenticated` role:

```
S1a Leo builder payload (status=draft, pct unchanged): rows=1, status now=draft
S1b Leo changes percentage: rows=1, pct now=65
```

Both accepted. The bypass was real: the builder's own payload moved a sent agreement back to
`draft`, which re-opened `ab_guard_ica_linehaul_split` (0027 locks the split only while the
status is not `draft`), and the percentage then changed freely. It also silently un-sent an
agreement the driver had already been asked to sign.

## Step 2 — the fix

### a) Database — migration `0029_agreement_status_forward_only.sql`

`ab_guard_ica_status_forward_only`, BEFORE UPDATE on `ica_contracts`, SECURITY DEFINER with a
pinned `search_path`. It ranks the four live statuses `draft` 0 → `sent_to_operator` 1 →
`fully_executed` 2 → `complete` 3 and refuses any move to a lower rank unless
`has_permission(auth.uid(), 'driver_pay.change')` — the owner only, since no role holds that
action. An unrecognised status on either side is not ranked; only the unambiguous move to
`draft` is refused in that case. `auth.uid() IS NULL` returns early, so a service-role caller
checks its own caller's permission, per design (d) — the same convention as the 0027 guards.
No new permission action was registered: `driver_pay.change` already exists and this is the
same protection, reached a different way.

**Ordering.** All the guards are BEFORE UPDATE FOR EACH ROW and fire in trigger-name order:

| Trigger | From | Question it answers |
| --- | --- | --- |
| `aa_guard_ica_contract_terms` | 0023 | Is the caller staff at all? (refuses a driver changing contract economics) |
| `ab_guard_ica_linehaul_split` | 0027 | May this caller change the percentage on an agreement already sent? |
| `ab_guard_ica_status_forward_only` | 0029 | May this caller move the status backward? |

So a driver still gets 0023's signing message, and staff get 0027's percentage message before
this one; this one speaks only when the status itself moves back. 0023 and 0027 are unchanged.
Undo is a comment at the head of 0029.

### b) Builder — `src/components/ica/ICABuilderModal.tsx`

Both save paths (`handleSaveAndClose`, and the legacy silent `handleSaveDraft` used when
progressing steps) no longer carry `status` in the update payload. `status: 'draft'` is now
written **only on the insert path**, when an agreement is created. Nothing else in the builder
changed.

### c) Every other writer of `ica_contracts.status`

| Writer | Move | Still correct |
| --- | --- | --- |
| `ICABuilderModal` — send for signature (line ~448) | → `sent_to_operator` | Forward. Unchanged. |
| `ICABuilderModal` — create | insert `draft` | Insert, not an update; the trigger is UPDATE-only. |
| `OperatorICASign` — driver or truck owner signs | → `fully_executed` | Forward. Unchanged. |
| `RecordPaperIcaModal` — recording a paper original | insert `complete` | Insert. Unchanged. |
| `truckSync` — mirrors truck specs into active agreements | writes no status (filters `status in (draft, sent_to_operator)`) | Untouched. |
| `DeactivationWizardContent` — voiding an agreement | writes `voided_at` / `void_reason`, **not** status | Untouched. |
| Edge functions (`file-executed-ica`, `reset-demo-driver`, the four others touching the table) | none writes `status` | Untouched; the service-role exemption is moot today. |

Live status spread for context: `fully_executed` 48, `sent_to_operator` 9, `complete` 7,
`draft` 1.

**P36 recorded:** *An agreement's status only moves forward; only the owner may move it back.*

## Step 3 — proof, one raising transaction, rolled back

Throwaway driver, a throwaway `sent_to_operator` agreement and a second throwaway `draft`:

```
P1 Leo saves sent agreement, new payload: rows=1, status=sent_to_operator, city=Kansas City
P2 REFUSED Not authorized to move this agreement back from sent_to_operator to draft.
   An agreement's status only moves forward; only the owner may move it back.
P3 REFUSED Not authorized to change the linehaul split on an agreement that has already been
   sent for signature. Only the owner can change a driver's contracted pay at this point.
P4 REFUSED Not authorized to move this agreement back from sent_to_operator to draft.
   An agreement's status only moves forward; only the owner may move it back.  (Mae)
P5 Marcus moves it back to draft: rows=1, status now=draft
P6 forward path draft->sent->fully_executed->complete: status=complete
```

P1 is the arm that proves ordinary work still works: the builder's new payload saves an edit on
a sent agreement and the status stays `sent_to_operator`. P3 shows P35 still holds. P6 runs the
whole forward path as Leo, end to end.

## Step 4 — today's scheduled jobs, read only

**`rollover-dispatch-status`, 05:05 UTC — proven.** `cron.job_run_details`: jobs 9 (05:05 CDT)
and 10 (06:05 CST) both `succeeded`. `net._http_response`, still in retention at 10:52 UTC:

```
2026-09-22 05:05:00 200 {"today":"2026-09-22","checked":33,"promoted":0,"skipped":33,"errors":[]}
2026-09-22 06:05:00 200 {"today":"2026-09-22","checked":33,"promoted":0,"skipped":33,"errors":[]}
```

`promoted = 0` as expected — the board already agreed with the calendar for every driver the
sweep saw. `checked` is **33, not the 34 expected**: 43 operators are active, not deactivated,
not excluded from dispatch and not parked, and **33** of those have any `dispatch_daily_log`
row at all — exactly the eligible set the function reduces. Not a defect and not a
contradiction; the eligible set simply differs from yesterday's count.

**`notify-idle-operators`, 15:00 UTC — not yet run.** Read at 10:52 UTC, before 15:05, so this
arm is skipped as the brief allows. `operator_idle` notifications dated 2026-09-22: **0**,
against **72** written yesterday. No new ones, so no recipients to name. The count read again
after 15:05 UTC settles day two's dedup; 0 new rows is the expected answer.

## Suite and typecheck

See the tail of this file.

## Files this pass authored

- `drizzle/migrations/0029_agreement_status_forward_only.sql`
- `src/integrations/supabase/types.ts` (regenerated from the new schema)
- `src/components/ica/ICABuilderModal.tsx` (status no longer written on update)
- `src/test/agreement-status-forward-only.test.ts`
- `docs/passes/2026-09-22-1100-agreement-status-forward-only.md` (this file)
- `docs/tms-wish-list.md` (rollover proof closed, idle dedup day-two entry, P36 done)
