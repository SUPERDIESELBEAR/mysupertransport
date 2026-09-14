# Unit Numbers panel — improvements

The Vehicle Hub "Unit Numbers" panel works but is plain: three long lists and a lookup box. This pass makes it faster to answer the two questions staff actually ask — "what number do I give this driver?" and "who has number X?" — and then we accept the draft so the real numbers appear.

## Improvements

1. **Answer-first header.** A highlighted strip at the top shows the next available number ("Next: 272") and the free-number count at a glance — no scrolling to find the answer to the most common question.
2. **Copy-to-assign.** Each number in the list gets a small copy button so staff can grab it and paste it into the onboarding pipeline without retyping.
3. **Recycle dates shown compactly.** Recycled numbers keep their "freed Sep 3" date but in a smaller secondary line so the list scans like a number column, not sentences.
4. **Lookup results pinned.** When you search a number, the result card stays at the top while you scroll — who holds it, whether it's live, and when it freed up.
5. **Empty/loading polish.** A proper loading shimmer instead of a blank panel, and a clear empty state if there are no recycled or gap numbers ("No recycled numbers — next available is 272").

## Not changing

- Assignment still happens in the onboarding pipeline picker — this panel stays read-only reference.
- Ordering stays recycled first, then gaps, then next — that was decided and approved earlier.

## Accepting the draft

After these improvements, accept the draft (button in the drafts panel, or say "accept the draft" in chat). Accepting is what turns on the live number list — until then the panel and the onboarding dropdown show the "turns on when accepted" message by design.
