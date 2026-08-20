# Pass 2 — Re-parse a revised rate confirmation into an existing load

Upload a reissued rate con on Load Detail, review a field-by-field diff, classify any money change, and apply through the existing edit write path. No new parser, no new load, no new save function.

## Answers to the two questions asked before building

### 1. Matching parsed stops to existing stops

Matching runs in three passes and never guesses when it is unsure.

1. **Address identity.** Normalized street key + 5-digit ZIP (the existing `normalizeAddressKey` / `normalizeZipKey` from facility matching). A hit here is a confident match regardless of position — this catches a stop that moved in the sequence.
2. **Position identity.** For anything unmatched: same sequence index AND same stop type AND same city/state. This catches a corrected street address at a stop that is otherwise clearly the same place.
3. **Everything else is ambiguous** and is never resolved by the code. Each leftover parsed stop and each leftover existing stop is shown in an "Unresolved stops" block, and the dispatcher chooses per parsed stop: *update stop N* (pick from the leftovers), *add as a new stop*, or *ignore*. Existing stops the dispatcher does not map are simply left as they are — the diff never deletes a stop. Deleting stays a manual edit-form action, which keeps the driver-data acknowledgment path intact.

A stop with driver-recorded check-in data is flagged in the diff and its address/appointment changes default to **reject**, so a broker correction cannot quietly rewrite a stop the driver already worked.

### 2. Broker reference number mismatch

Treated as a wrong-document signal, not a field diff.

- If the parsed broker **MC number** resolves to a different broker than the load's, the upload is refused outright. No diff is shown, nothing is written.
- If the broker matches but the **broker reference / load number** on the document differs from the load's, a blocking gate appears first: both values side by side, and the plain statement that this may be a rate con for a different load. The dispatcher must either cancel or explicitly confirm it is the same load. Only then does the diff render, and the confirmation is recorded in the change reason and the audit note.
- If the load currently has no broker reference and the document supplies one, that is an ordinary non-financial change, not a mismatch.

## Entry point

"Upload Revised Rate Con" button next to Edit Load on the Load Detail header, visible to dispatcher, management, owner only. It opens a dialog that accepts the same file types as the create-form parser and calls the existing `parse-rate-confirmation` edge function unchanged.

The file uploads as a `load_documents` row with type `revised_rate_confirmation` only after changes are applied. The original rate confirmation is never touched.

## The diff screen

No pre-filled form, no writes until Apply.

**Non-financial changes** — facility names, addresses, appointment windows, contacts, references, commodity, weight, equipment, handling type, special instructions. Accept/reject toggle each, defaulting to accept (except stops with driver data, which default to reject).

**Financial changes** — linehaul, FSC, and any new or changed charge line. Each one shows the delta and requires a classification before it can be accepted:

- Linehaul rate correction → updates `linehaul_rate` directly, no charge row.
- Detention / stop-off / lumper / layover / TONU → creates a `load_charges` row of that type, `linehaul_rate` untouched.
- Other → same, with a required description.

When the document itemizes the line ("Detention 2 hrs @ $40"), the matching option is pre-selected but still needs an explicit confirm. Decreases work the same way: the classification names what is being reduced, and a reduction against an existing charge adjusts that charge rather than creating a new one.

## Locked statuses

Financial rows in the diff are disabled at a financially locked status, with the same explanation and the same owner-unlock path as the manual edit form. Non-financial changes remain acceptable. Nothing is silently dropped — a blocked row shows why it is blocked.

## Applying

Accepted changes merge into the current load values and go through `update_load_with_stops` exactly as a manual edit does — status tiering, owner unlock reason, stop reconciliation that preserves driver GPS and timestamps, and change history all apply unchanged.

The change reason is pre-filled automatically, e.g. `Revised rate confirmation received 8/21`, appended with the classification summary and any same-load override confirmation. The dispatcher may add to it but never has to type a justification.

## Technical notes

- New `src/lib/revisedRateCon.ts`: stop matching (reusing `normalizeAddressKey`/`normalizeZipKey`), the diff builder over `LoadFormValues` (current load hydrated via the existing `loadToFormValues`), the financial classification model, and the merge that produces the values handed to the save call.
- The load/stops/charges payload builder currently inline in `CreateLoadPage.performSave` is extracted to a shared module so the diff apply and the edit form emit byte-identical payloads. No behavior change to the edit form.
- New UI under `src/components/dispatch/loadDetail/revisedRateCon/`: upload dialog, mismatch gate, diff screen, financial classification row, unresolved-stops block.
- `FINANCIAL_FIELDS` from `loadEdit.ts` decides which diff rows are financial, so the client and the server agree on what needs a reason.

## Tests

- Operator access: extend the operator access test file — the re-parse action is absent for an operator and the diff screen does not render for one.
- Classification: same parsed increase classified as detention creates a `load_charges` detention row and leaves `linehaul_rate` unchanged; classified as a linehaul correction it raises `linehaul_rate` and creates no charge row.
- Rejection: a rejected change leaves the existing value untouched in the applied payload.
- Stop matching: address-identity match across a moved sequence; position match on a corrected address; a genuinely new stop 1 falls to unresolved rather than overwriting stop 1.
- Broker mismatch: differing MC blocks the diff; differing reference number requires explicit confirmation before the diff renders.
