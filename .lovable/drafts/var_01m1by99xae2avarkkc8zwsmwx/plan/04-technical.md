## Technical

All changes are in the comparison layer — no schema change, no stored serial is rewritten.

`src/lib/equipmentSync.ts`:
- Add `LOOKALIKE_PAIRS` (unordered character pairs: `0O`, `1I`, `1L`, `17`, `5S`, `68`, `6G`, `2Z`, `8B`) and `isSoftNearMatch(a, b)`: canonical forms of length >= 8, and either a length difference of exactly 1 with edit distance 1, or equal length with exactly one differing position whose character pair is in `LOOKALIKE_PAIRS`.
- `findSerialMatches` swaps its `editDistance(...) === 1` test for `isSoftNearMatch`. The `'collision'` branch (folded equality, hard block) is untouched.

`src/components/equipment/SerialConflictsPanel.tsx`:
- The near-pair loop uses `isSoftNearMatch` instead of `editDistance === 1`.
- Option D: render near-pairs in a separate collapsed section under the confusable conflicts with an "N similar serials" summary line. Merge and "these are different devices" behave exactly as they do now, including the shared dismissal records.

The confusable-serial database guard and the unique index on the canonical serial are unchanged — the hard block on true duplicates stays exactly as strict as today.

Existing dismissals stay valid; pairs that no longer qualify simply stop appearing and their dismissal rows become inert.

## Verify

Re-open Onboard Systems: the conflicts list should show only folded duplicates plus a handful of similar-serial pairs, and fuel cards should raise nothing. Entering `AABL36YG100566` when `…586` exists should still warn; entering a card number that already exists should still be blocked outright.
