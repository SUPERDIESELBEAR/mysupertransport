# Fix broker duplicate name-matching condition

Confirmed: the code is narrower than the approved plan. In `src/lib/brokerDuplicates.ts`, the name-match branch requires `!candidateMC && !rowMC`, so a new broker with no MC is never compared by name against an existing broker that has one — the exact BlueGrace case passes silently.

## Change

- `findDuplicateBrokers`: drop the `!rowMC` condition so name matching runs whenever the **new** record lacks an MC number, regardless of the existing record's MC. Behavior when the candidate has an MC stays as is (MC mismatch is not warned on by name).
- Update the comment to state the rule accurately.
- Sorting/`matchReason` semantics unchanged; MC matches still rank first.

## Tests

In `src/lib/__tests__/brokerDuplicates.test.ts`:
- Add: new broker with no MC and a name matching an existing broker that **does** have an MC surfaces a warning with `matchReason: 'name'`.
- The existing "no MC on either side" and "candidate has non-matching MC" cases remain and should still pass.
