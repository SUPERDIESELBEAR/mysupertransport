# Fix: "Void ICA" fails when a lease termination exists

## What's happening
When Mae clicks **Yes, Void ICA** in Stage 3, `handleVoidICA` in `src/pages/staff/OperatorDetailPanel.tsx` runs a hard `DELETE` on `ica_contracts` for that operator. If a `lease_terminations` row was ever generated for that contract (Appendix C), Postgres blocks the delete because `lease_terminations.ica_contract_id` has a foreign key to `ica_contracts(id)` with the default `NO ACTION` behavior — hence:

> update or delete on table "ica_contracts" violates foreign key constraint "lease_terminations_ica_contract_id_fkey"

Ian Dunfee already had a lease termination generated during his unit change, which is why the void fails for him but works for other drivers.

## Fix

Change the foreign key so voiding the ICA preserves the historical termination record but detaches it from the deleted contract.

### Migration
Drop and recreate `lease_terminations_ica_contract_id_fkey` with `ON DELETE SET NULL`:

```sql
ALTER TABLE public.lease_terminations
  DROP CONSTRAINT lease_terminations_ica_contract_id_fkey,
  ADD  CONSTRAINT lease_terminations_ica_contract_id_fkey
       FOREIGN KEY (ica_contract_id)
       REFERENCES public.ica_contracts(id)
       ON DELETE SET NULL;
```

`lease_terminations.operator_id` remains intact, so the termination stays attached to the driver's history even after the old ICA row is voided.

### No app-code changes required
`handleVoidICA` already deletes `ica_contracts` and resets `onboarding_status.ica_status` to `not_issued`; with the new cascade rule the delete will succeed on drivers who have prior terminations.

## Verification
1. Reproduce on Ian Dunfee: open Stage 3 → Void ICA → confirm. Toast should read "ICA voided" and Stage 3 resets to Not Issued.
2. Confirm the historical `lease_terminations` row still exists for Ian and now has `ica_contract_id = NULL`.
3. Re-issue a fresh ICA and confirm the new contract row saves cleanly.
