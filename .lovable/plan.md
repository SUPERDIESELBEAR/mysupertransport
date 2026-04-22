

## Make the MO dot show "Owns Own Registration" in the Applicant Pipeline

### The problem (confirmed in data + code)

The Applicant Pipeline shows a row of stage dots (BG · DOCS · ICA · **MO** · EQUIP · INS · DISP · PAY). The MO dot only ever renders in three states: empty/grey (none), hollow gold (partial), or solid green check (complete).

When an operator owns their own MO registration (e.g. **Bobby Thompson**, **Johnathan McMillan**, **Johnathan Pratt** — all confirmed `registration_status = 'own_registration'` in the DB), there's nothing for the pipeline to "complete" because the stage genuinely doesn't apply. The dot falls through to the empty/grey style — visually identical to "not started" — even though the **OperatorDetailPanel** already knows about a fourth state (`'na'`) and shows a clear "N/A — O/O Has Own Reg" tooltip there.

The Pipeline's `StageTrack` (`src/pages/staff/PipelineDashboard.tsx`) just never got that fourth state.

### Recommendation

Add a distinct **"N/A — Owns Own Registration"** visual state to the MO dot (and only the MO dot — the other stages don't have an N/A concept). It should read at a glance as *"this is intentionally satisfied, not missing."*

#### Visual design

A filled brand-gold dot with a small "OO" glyph (Owner-Operator), gold label, and a gold connector to the next stage — clearly different from both green ("done by us") and empty ("nothing yet"):

```text
 ●  ─  ●  ─  ●  ─  ◉  ─  ○  ─  ○  ─  ○  ─  ○
 BG    DOCS   ICA    MO    EQUIP  INS    DISP   PAY
                     OO
                     gold, filled, "OO" inside
```

- **Fill**: brand gold `hsl(var(--brand-gold))` (matches existing SUPERTRANSPORT identity)
- **Glyph**: tiny "OO" in white, 8px bold, centered (mirrors the existing "E" exception pattern on the EQUIP dot)
- **Label color**: gold to match
- **Connector after MO**: gold (treated like a "satisfied" stage so the line forward isn't broken/grey)
- **Tooltip**: "**Missouri Registration** — N/A · Owner-Operator has own registration. No action required."
- **Counts as complete** in `computeProgressFromConfig` so progress % isn't penalized for an intentionally-skipped stage.

#### Why "OO" and not a checkmark

A green check would suggest "we received the MO plate from the state." Gold + "OO" reads as "exempt because the operator brought their own" — the same semantic the Detail Panel already uses. It also keeps the existing "exception" visual vocabulary consistent (EQUIP shows amber "E" for exceptions; MO shows gold "OO" for owner-supplied).

#### Tooltip details panel

When hovering the gold MO dot, instead of the "Still needed" checklist (which would be empty and confusing), show:

> **Missouri Registration**
> ✓ Owner-operator has own registration on file
> *No state filing required for this driver.*

### Technical changes (one file)

**`src/pages/staff/PipelineDashboard.tsx`**

1. **`computeStageNodesFromConfig`** (≈ line 67): for the `mo` stage, when `op.registration_status === 'own_registration'`, return `state: 'na'` (new fourth value) regardless of items.
2. **`NodeState` type**: extend to `'none' | 'partial' | 'complete' | 'na'`.
3. **`StageTrack` render block** (≈ lines 189–227): add a fourth style branch for `state === 'na'` — gold fill, white "OO" glyph, gold label, and treat the *outgoing* connector as gold (line 169).
4. **`computeProgressFromConfig`** (≈ line 104): count an `na` stage as done so the progress bar reflects reality for own-registration operators.
5. **Tooltip body**: when `state === 'na'`, render the "N/A · Owner-Operator has own registration" message instead of the items list.

No DB changes. No changes to OperatorDetailPanel (it already handles `'na'` correctly). No changes to other stages or temperature logic (which already treats `own_registration` as satisfying stage 4 — see line 396).

### What you'll see after

- **Bobby Thompson, Johnathan McMillan, Johnathan Pratt** → MO dot turns into a filled gold dot with a tiny "OO", gold "MO" label, gold connector forward.
- Progress bar moves up appropriately (stage 4 now counted as satisfied).
- Hovering MO shows the new explanatory tooltip instead of an empty "Still needed" list.
- All other operators (needs MO reg) are unchanged — green check when received, gold hollow when docs submitted, grey when not started.

### Out of scope

- Detail Panel (already correct).
- Operator Portal stage status (already returns `'complete'` for own_registration — see `src/pages/operator/OperatorPortal.tsx:443`).
- Database/schema work.

