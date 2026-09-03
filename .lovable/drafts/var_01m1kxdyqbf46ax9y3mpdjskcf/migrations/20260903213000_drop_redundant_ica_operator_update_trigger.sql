-- ICA re-send from a saved draft failed with:
--   "trigger functions can only be called as triggers"
--
-- Cause: public.enforce_ica_contracts_operator_update() is a trigger function whose
-- entire body is `RETURN public.enforce_ica_contracts_operator_column_whitelist();`.
-- PL/pgSQL rejects a direct by-name call to a trigger function, so every BEFORE UPDATE
-- on public.ica_contracts aborted.
--
-- The wrapper is redundant: trg_ica_contracts_operator_column_whitelist is already
-- bound to the same table and executes the same whitelist function correctly.
-- Dropping the wrapper trigger removes the fault and changes no authorization rule.
--
-- The whitelist function and its own trigger are untouched. No column is dropped,
-- renamed, or retyped.

DROP TRIGGER IF EXISTS trg_enforce_ica_contracts_operator_update ON public.ica_contracts;
