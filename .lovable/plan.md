# ST26034 revision review — findings on all four items

## What I verified before writing this

- The load row, its stops, its charges, its `load_references` and `load_reference_citations` rows.
- `buildRevisionDiff` and its field specs in `src/lib/revisedRateCon.ts`.
- `loadToFormValues` in `src/lib/loadEdit.ts`.
- Every call site of `saveLoadReferences`.
- The parser edge function source, and its live log output from the 17:43 run.

## Item 2 — the phantom PU# reference: confirmed, and worse than suspected

`load_references` and `load_reference_citations` are **completely empty for ST26034** — zero rows. So the diff is comparing the revised document against an empty set, exactly as you suspected. Every reference on any document will read as an addition.

But this is not a "load predates the table" problem. Two independent breaks:

1. **Nothing ever writes references.** `saveLoadReferences` in `src/lib/loadReferences.ts` exists and is correct, and `buildLoadSavePayload` dutifully returns a `references` array — but no code anywhere in `src` calls `saveLoadReferences`. The create path builds the payload and drops the reference array on the floor. No load has reference rows, new or old.
2. **Nothing ever reads them back.** `loadToFormValues` hardcodes `references: []`. Even once rows exist, the revision diff would still compare against an empty set.

The row also arriving checked is by design (`defaultAccept: true` on reference rows) — defensible once the comparison set is real, indefensible while it is always empty.

## Item 3 — the missing PRO, and item 2's "why only one": the deployed parser is stale

The 17:43 edge function log reads:

```text
parse-rate-confirmation: discarded reference numbers — stop 2: "PO#"=001000562117 [duplicates a load-level id]
```

That log string **does not exist in the current source**. It was removed at 16:19 UTC today, in the same change that moved dedup out of the function and into `classifyReferences`. The function running at 17:43 was still emitting it, so the deployed build predates the reference-class work entirely.

That single fact explains both remaining reference symptoms:

- The old build has no document-level `references` output, so the whole References table — `PRO BG969676425`, `Pickup Number IX00286060`, and the rest — never reached the client. The only reference that arrived was stop 1's `PU#`, read from the stop block. Hence one addition rather than six, and hence no PRO.
- The old value-keyed dedup is exactly what would have dropped `PRO BG969676425` for colliding with the BOL, had the table been emitted at all.

Corroborating evidence on the same run: the review screen showed no "as printed" rows. `special_instructions_verbatim` is `NULL` on the stored load and the revised document produced no verbatim row either — the old build does not return the `verbatim` block.

## Item 1 — the missing $30 Wash out: not yet explained, and I will not guess

The charge diff logic reads correctly: a `line_items` entry with category `other` and amount 30, against no existing charge, yields `current 0 → revised 30`, unchecked, requiring classification. `load_charges` for ST26034 is empty, so there is nothing for it to have collapsed against. The stored rate decomposes as linehaul 1224 + FSC 176 = 1400, so the revised 1430 is 1400 + the wash out — meaning `rate.linehaul` and `rate.fsc_amount` are legitimately unchanged and the wash out is the only money row expected.

What I cannot yet say is whether the deployed build returned the wash-out line at all. The gateway payload for that run is redacted, and the function logs nothing about `line_items`. The stale deploy is the leading suspect — the same build differs from source in ways I have already proven — but I am not going to name it as the cause without the parse output in front of me.

## Plan

**Step 1 — redeploy the parser and re-run, with the money path instrumented.**
Redeploy `parse-rate-confirmation` so the running build matches source. Add a log line recording the parsed `line_items` (description, amount, category) and the document-level `references` rows, so the next run answers item 1 from evidence rather than inference. Re-parse the revised Blue Grace document against ST26034 and report what came back.

If the wash out is present in `line_items` and still produces no financial row, the fault is in `buildRevisionDiff` and I will fix it there. If it is absent from the parse, the fault is the prompt's handling of the Charge Details block and I will fix it there. No change to the charge diff before that run.

**Step 2 — close the reference write path.**
Call `saveLoadReferences` from the load save path so create and revision both persist reference rows and citations, and read them back in `loadToFormValues` instead of the hardcoded `[]`. Backfill is not proposed: the stored `load_stops.reference_number` single slot is a lossy record of what the document printed, and inventing citations from it would produce exactly the confident-wrong-answer failure this work has been avoiding. Loads created before the fix will show their references as additions on the first revision, which is honest, and I will note it on the review screen when the load has no reference rows on file.

**Step 3 — item 4, the "(display summary)" label.**
`buildRevisionDiff` reads **both** fields. `LOAD_FIELDS` carries `special_instructions` labelled "Special instructions (display summary)" and `special_instructions_verbatim` labelled "Special instructions (as printed)". The row you saw is the condensed display field, and it appeared because that field is a model-authored summary — two runs of the same document reword it, so it diffs even when the printed block is byte-identical. The verbatim row was absent only because the stale build returns no verbatim block.

Once the redeploy lands, the correct behaviour is: the verbatim field is what gets compared and stored, and the display summary stops generating a diff row of its own. I will confirm the verbatim block returns on the Step 1 re-run before changing which field the row reports, so the change is made against observed output.

## Technical notes

- `supabase/functions/parse-rate-confirmation/index.ts` — redeploy; add `line_items` and document-level `references` logging.
- `src/lib/loadEdit.ts` — `loadToFormValues` reads `load_references` via `fetchLoadReferences` instead of `references: []`.
- Load save path — call `saveLoadReferences` with the payload's reference array after the RPC returns the load id.
- `src/lib/revisedRateCon.ts` — display-summary row suppression, and any charge-diff fix Step 1 justifies. Not touched before the re-run.
- No schema changes. `load_references` and `load_reference_citations` already exist and are correct.
