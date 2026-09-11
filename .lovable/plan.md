# Complete Pass 2 verification

## Scope
Run only the remaining verification checks. Make no application, database-schema, migration, documentation, or source changes.

## Checks
1. Re-run `has_role` through an execution context permitted to call it and report its exact result.
2. Use rollback-only transactions to capture the verbatim refusals for:
   - inserting a second owner;
   - deleting the current owner;
   - changing a non-owner role to owner;
   - changing the owner role away from owner;
   - calling `bootstrap_assign_owner` while an owner exists.
3. Prove `bootstrap_assign_owner` succeeds in a rollback-only zero-owner simulation using scratch data, leaving live data unchanged.
4. Exercise each non-owner role path where safely possible and roll back database writes. For edge-function flows that cannot be safely invoked without sending invitations, deleting accounts, or provisioning users, verify their actual write statements against the trigger condition and report them as source-verified rather than exercised.
5. Verify the deployed `delete-user-account` owner-target refusal without deleting an account and capture its exact response.
6. Report the already completed six-suite result and run any focused verification needed for uncovered behavior.

## Report
Lead with the exact `has_role` result and owner count. Include every refusal verbatim, identify exercised versus source-only paths, name every suite, and state any verification limitation plainly.
