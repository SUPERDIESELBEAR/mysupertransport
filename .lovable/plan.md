

## Fix: Move Johnathan Pratt Out of the Pipeline

Johnathan Pratt's operator record exists but `fully_onboarded` is still `false`, which is why he appears in the Applicant Pipeline. His `active_dispatch` row already exists.

### Data fix (no code changes)

Run two UPDATE statements using the insert tool:

1. **Set `fully_onboarded = true`** on `onboarding_status` for operator `f2051752-5311-4c1f-b88c-79773e7ed9e5`
2. Optionally confirm the `active_dispatch` row is correct (it already exists with `not_dispatched` status, which is fine for a pre-existing operator)

This is a one-time data correction for an operator created before the edge function fix was deployed. No schema or code changes needed.

