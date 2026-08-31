# Quiet the serial-conflict noise

The Serial Conflicts panel currently flags any two serials one character apart, which produces roughly 400 review pairs — mostly fuel card numbers and harmless sequential serials. This change applies the three agreed tightenings:

**A. Fuel cards stop near-matching.** Card numbers are short sequential codes, not serials. The exact-duplicate block stays (card 201 cannot be entered twice), but the "one character apart" review disappears for them. Implemented as a minimum length: near-matching applies only to serials of 8+ characters, which covers ELD, dash cam and BestPass and excludes every card number. Removes ~364 of ~403 pairs.

**B. Only look-alike substitutions are flagged.** When two same-length serials differ in exactly one character, flag only if the differing pair is genuinely confusable on a printed label: 0/O, 1/I, 1/L, 1/7, 5/S, 6/8, 6/G, 2/Z, 8/B. Sequential tails like …310901 vs …310903 go quiet; cases like …586 vs …566 stay flagged. Removes ~29 more.

**C. Length-difference pairs stay flagged.** A serial one character shorter or longer is a dropped or doubled keystroke — sequential numbering never produces that. This is the case that caught the Chrestman/Herring pair, so it stays.

The hard duplicate block (folded/canonical equality) is untouched — true duplicates stay just as strict. Expected result: the review queue drops from ~400 pairs to roughly 10, all worth a look.
