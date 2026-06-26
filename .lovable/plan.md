# Remove redundant/editable‑looking Date field from the ICA contractor signature block

## What's actually on screen

The "Date:" the user circled is **not** an `<input>` — it's the `SigLine` component at `src/components/ica/ICADocumentView.tsx:317`:

```tsx
<SigLine label="Date" value={contractorSignedAt ? fmtDate(contractorSignedAt) : undefined} />
```

`SigLine` renders a label plus a bottom‑border `<span>` (lines 518–527). Pre‑execution `contractorSignedAt` is `null`, so the span is empty and visually reads as a blank fill‑in line. It is read‑only in code, but it looks editable — the user's concern is valid.

Immediately above it (line 305) there is also a redundant inline string:

```tsx
<p className="text-xs text-muted-foreground">Date: {new Date().toLocaleDateString(...)}</p>
```

This prints today's wall‑clock date the instant the page renders, not the true submission moment — also wrong for a legal artifact.

## Fix (scope: `src/components/ica/ICADocumentView.tsx` only)

1. **Delete the inline "Date: …" `<p>` at line 305.** It duplicates the signature date below and shows browser‑local time rather than the server‑recorded execution timestamp.

2. **Replace the contractor `SigLine` Date row (line 317) with explicit, non‑underlined rendering** driven solely by `contractorSignedAt`:
   - Before execution: muted helper text `"Signed on: — auto‑filled when you tap Execute Agreement"`, no underline, no input affordance.
   - After execution: bold label `"Signed on: <fmtDate(contractorSignedAt)>"`, no underline.
   - `contractorSignedAt` already comes from the server (`ica_contracts.signed_at` / `executed_at` set inside the `execute-ica` flow), so the timestamp is the true submission moment and cannot be altered by the driver.

3. **Apply the same "label, not underline" treatment to the contractor `SigLine` Name row (line 316)** so the post‑signature block reads as a clean attestation summary rather than a second set of blanks:
   - Pre‑execution: muted `"Name: <typed name as they type, or '—'>"`.
   - Post‑execution: bold `"Name: <contractorTypedName>"`.
   - Value is still bound to the typed‑name input above — no new editable surface.

4. **Leave the Carrier block (lines 271–273) alone.** Name/Title/Date there already auto‑populate from carrier settings + `carrierSignedAt` and the screenshot confirms they render correctly ("Marc Mueller / Owner / June 26, 2026"). Optional polish: swap those three `SigLine`s for the same flat‑label style for visual parity — call this out but only do it if the user wants matching styling.

## Audit of other date/name fields in the ICA flow

Scanned `src/components/ica/` and the operator portal:

| Location | Field | Status |
| --- | --- | --- |
| `ICADocumentView.tsx:190` Deposit Initials + Date | Contractor‑elected deposit option date | **Intentionally driver‑entered** (it records *when the driver elected the deposit plan*, a separate datum from the signature). Leave as is — flag for user confirmation. |
| `ICABuilderModal.tsx:779` carrier preview "Date: <today>" | Staff‑side carrier countersign preview | Same `new Date()` anti‑pattern but on the **staff side** and only shown in the builder preview before the contract is generated. Out of scope for this driver‑facing fix; happy to follow up if wanted. |
| `CarrierSignatureSettings.tsx` Typed Full Name | Staff settings, not part of the driver signing flow | Out of scope. |
| Operator portal ICA acknowledgement page | No manual date inputs | OK. |

No other manually‑editable date fields exist in the driver‑facing ICA signing path.

## Verification

- Open `/operator?tab=ica` as a test driver pre‑signature → the contractor block shows the helper text, no blank underline, no inline duplicate date.
- Tap **Execute Agreement** → the same row immediately reads `Signed on: <today>` using the server‑returned `signed_at`, matching the timestamp written to `ica_contracts`.
- Re‑open the signed agreement (read‑only path, `contractorSignatureUrl` branch) → same flat `Signed on: …` line; no extra blanks.

## Out of scope / confirm before doing

- Restyling the **carrier** Name/Title/Date trio to match (currently still uses underline `SigLine`s, but values are correct).
- Cleaning up the deposit‑election Date on line 190 (this is a different legal field, not a signature date).
- Staff‑side `ICABuilderModal` preview date.
