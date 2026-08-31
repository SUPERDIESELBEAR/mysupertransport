## Options to loosen it

Each can be taken alone or combined. My recommendation is A + B + C, with D as an optional extra.

**A. Stop near-matching fuel cards** — removes 364 of the 403 pairs.
Fuel card numbers are short sequential codes, not serials. Keep the exact/folded duplicate block for them — you still cannot enter card 201 twice — but drop the "one character apart" review entirely. Implemented as a minimum length: near-matching applies only to serials of 8 characters or more, which covers ELD, dash cam and BestPass and excludes every card number.

**B. Only flag look-alike substitutions** — removes ~29 of the remaining 39.
When both serials are the same length and differ in exactly one character, flag it only when that pair is genuinely confusable on a printed label: `0/O`, `1/I`, `1/L`, `1/7`, `5/S`, `6/8`, `6/G`, `2/Z`, `8/B`. Your `…586` vs `…566` case stays flagged (6 vs 8); `…310901` vs `…310903` and `…251041` vs `…251044` go quiet.

**C. Keep length-difference pairs flagged.**
A serial one character shorter or longer than an existing one is a dropped or doubled keystroke — sequential numbering never produces that. This is the case that caught Chrestman/Herring, so it stays.

**D. Demote near-matches out of the review queue.**
Split the panel: the top section stays "Conflicts to review" (folded duplicates only — the same device entered twice). Near-matches move to a collapsed "Similar serials" section below, shown as a count rather than an open task. The add/assign forms keep the inline amber "very close to X" hint at the moment of typing, which is where it actually prevents the mistake.

**E. Widest option — near-matching off entirely.**
Only exact-after-folding duplicates are ever flagged. Simplest and quietest; the trade-off is that a dropped digit creates a phantom device with no warning. I would not pick this, but it is available.

## Expected result

With A + B + C the review queue drops from about 403 pairs to roughly 10 across all device types, and every one that remains is a pair worth looking at.
