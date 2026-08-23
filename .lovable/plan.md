# Word-level transcription corruption, then reference removals

## What the measurements show so far

**The verdict this capture received on this run: `verified`.** Measured, not assumed:

- The comparator's only content signals are whole-block Dice bigram similarity (threshold 0.99) and the high-signal token check (emails, phones, dollar amounts, digit runs of 5+).
- A single inserted syllable in an 833-character block scores **0.9982** — above the 0.99 threshold. Reproduced directly against a block of the same length.
- `detention` is not a token type the presence check extracts, so `tokenPass` stays true.
- `detentention` contains no pilcrow, control character, entity chain or replacement character, so `transcription_damaged` does not fire.

Every gate passes, so the verdict is `verified`. The stored record on ST26035 (create path, same field) reads `verified` for its verbatim fields, which is the shape this run would have taken too.

**A word-membership check catches it exactly.** Against the same layer region, the only word in the capture absent from the printed region is `detentention` — one word, no false positives from the rest of the block. That is the signal similarity cannot provide at this length.

## 1. Add a word-presence check to the comparator

No threshold change. A new, independent signal alongside similarity and tokens.

- New `unknownWords(transcription, region)` in `verbatimVerify.ts`: every alphabetic word of 4+ characters in the normalized capture that does not appear in the normalized region's word set. Case-insensitive; punctuation and digits stripped for membership only, so hyphenation and casing do not generate noise.
- New verdict `unverified` reason and a new reported field `unknownWords: string[] | null` on `VerbatimVerification`, alongside `missingTokens`. `wordPass` joins `similarityPass` and `tokenPass` in the reported record.
- Ranking: `transcription_damaged` still outranks everything. Below it, a non-empty `unknownWords` list fails the field to `unverified` (or `layer_unreliable` when the region's own damage exceeds the limit, same as today) regardless of similarity. A word the page does not print cannot be a verbatim transcription of it.
- This is a two-way check by construction: `missingTokens` catches what the page prints and the capture dropped; `unknownWords` catches what the capture prints and the page does not. The dropped phone number and the invented syllable are the two halves of the same hole.

Measured before the ranking is wired: the faithful ST26035 captures must produce an empty `unknownWords` list against their own regions. If the real documents produce noise words (a hyphen break, a ligature), the normalization is tightened until they do not — a check that cries wolf on clean captures is worse than no check.

## 2. Surface it where the value is accepted

- Parser review list and the revision diff row show the offending words in context, phrased plainly: "contains words the page does not print — `detentention`".
- A verbatim row failing on unknown words **defaults to reject**, the same treatment as a damaged capture, and the existing repair field applies unchanged (repair is still gated on rendering the page).

## 3. Whether the prompt instruction is implicated

Measurable, and measured before anything is changed: the same document, same field, two runs — the create-path capture stored on ST26035 and this run's capture. Diff them word by word.

- If the only difference is the typo span, the instruction is not rewriting content and stays as written; the typo is ordinary model noise that the word check now catches.
- If differences appear outside artifact spans — re-cased words, dropped or added words, reflowed punctuation — the instruction is editing text it was not meant to touch, and it gets narrowed: instead of "read the printed glyphs", it becomes "if a span comes through as one of these artifact characters, omit that span; never substitute, reword or correct anything else", which removes the licence to edit while keeping the artifact suppression.

The finding is reported either way with the actual diff, not a judgement.

## 4. Reference removals actually remove (queued behind the above)

Confirmed by reading the write path: `applyRevision` drops the reference from the in-memory list, but `saveLoadReferences` only inserts and upserts — it returns early on an empty array and never deletes. So an accepted "Reference removed" row changes nothing, and the row reappears on every future review. Mirror of the additions-write/removals-do-not gap found earlier.

**Citations, checked for the same shape:** for a reference that is *still on the document*, `file_load_references` deletes and rewrites that reference's citations wholesale, so a citation that disappears is correctly removed. For a reference removed entirely, both its row and its citations linger — the same single gap, not two.

The fix: the revision apply path sends the full intended reference set with an explicit removal list, and the filing RPC deletes the named reference rows (cascading their citations) in the same transaction as the writes. Removal is recorded in `load_change_history` like any other change, with the value that was removed.

**Should the removal row be pre-checked? No — it changes to default reject.** A number missing from a revised document has two causes: the broker dropped it, or the parser did not read it this time. The typo above makes the second cause concrete, and the two are indistinguishable from the diff alone. Deleting a filed reference is destructive and reappears silently; adding one is not. So the row renders with both readings stated and requires an explicit decision. Accepting stays one click.

## Technical notes

- `verbatimVerify.ts`: `unknownWords`, `wordPass`, verdict ranking, and the record shape. The stored `verbatim_verification` envelope gains the two fields — readers already normalize per field, so an older record without them renders unchanged.
- `VerbatimVerificationCard.tsx` and the revision diff row render the new failure reason.
- `loadReferences.ts` + a migration to `file_load_references` for the removal list; `revisedRateCon.ts` emits it and flips the removal row's `defaultAccept` to false.

## Tests

- Pinned regression: the `detentention` capture against the real Blue Grace region scores above 0.99, `tokenPass` true, and must **not** read `verified`.
- The faithful capture on the same document still reads `verified`, with an empty `unknownWords` list — asserted so the check cannot start producing noise unnoticed.
- The dropped-phone-number case still fails on tokens, unchanged.
- Removal: an accepted removal row deletes the reference and its citations, is absent on a re-read, and does not reappear in a second diff.
- Removal default: a removal row's default decision is reject; an addition row's is accept.
- Both-paths reachability, per the standing rule: the word check runs on the create path and the revision path, and the removal write is reachable from the revision path.

Nothing is applied on the open review until you say so.
