## Fix ICA Contractor signature block in staff preview

Two issues on the staff-side "Review ICA" preview (Step 2 of the ICA Builder), both inside the Contractor column of the Signature Page in `src/components/ica/ICADocumentView.tsx`.

### Problem 1 — "Name: —"
`SignedAttestation` renders `name={contractorTypedName || contractorSignedName}`. In staff preview, neither is set until the driver signs, so the field falls back to a dash. The driver's name is actually already computed higher up as `contractorLabel` (owner name / d/b/a) and shown in bold above the signature box, so the Name row is redundantly blank.

### Problem 2 — Driver-facing placeholder leaking into staff view
`SignedAttestation`'s unsigned branch always renders:
`Signed on: — will fill in automatically the moment you tap Execute Agreement below`
This copy is written for the driver's live signing screen (`OperatorICASign`) but also shows on the staff preview (`ICABuilderModal` passes `previewMode`, `ICAViewModal` / `FormsCatalog` render read-only), because `SignedAttestation` has no awareness of preview vs. signing context.

### Fix

Update `ICADocumentView.tsx` only:

1. Pass a "preview / read-only" hint and a fallback name into `SignedAttestation` from the Contractor block (line ~315):
   - `previewMode` (already in scope)
   - `fallbackName={contractorLabel}` so the Name row is never blank when we already know who the contractor is
2. Rewrite `SignedAttestation` (lines 530–545) with three states:
   - **Signed** (`signedAt` present): unchanged — `Name: <name>` bold, `Signed on: <formatted date>` bold.
   - **Unsigned + staff/preview view** (`previewMode` true, no `signedAt`): `Name: <fallbackName>` (read-only, normal weight) and `Signed on: Awaiting driver signature` in muted italic — no "tap Execute Agreement" copy.
   - **Unsigned + driver signing view** (`previewMode` false, no `signedAt`): keep today's live copy so the driver still sees `Name: <typed name as they type>` and the "will fill in automatically the moment you tap Execute Agreement below" hint.
3. No other files change. All existing callers (`ICABuilderModal` with `previewMode`, `ICAViewModal`, `FormsCatalog`, `OperatorICASign`) already pass the correct `previewMode` value, so the new branching lands automatically:
   - Staff previews render the clean read-only labels.
   - Driver signing flow keeps its guidance copy.
   - Post-signing, both views render identically from `contractorSignedAt` / `contractor_typed_name`.

### Technical notes

- `contractorLabel` already resolves to `"Owner Name d/b/a Business Name"` (or the plain owner/operator name), which is the same string shown in bold at the top of the Contractor column, so using it as the Name fallback keeps the staff preview consistent with what's already on screen (matches "Emma Mueller" in the screenshot).
- No schema, RLS, or data-source changes. Staff preview and driver flow continue to render from the same props; only the labels differ per view.
- No changes to `contractor_signed_at` handling — once the driver executes the agreement, the signed branch takes over in both views automatically.