

## Why your signature isn't on the ICAs (and how to fix it)

### Root cause — verified against the database

This affects **all 23 ICAs**, not just McMillan and Lockett:

| What's saved | Status |
|---|---|
| `carrier_typed_name` = "Marc Mueller" | ✓ present |
| `carrier_title` = "Owner" | ✓ present |
| `carrier_signature_url` (image) | **NULL on every ICA** |

The default carrier signature row also confirms it:
```
carrier_signature_settings → typed_name: "Marc Mueller", title: "Owner", signature_url: (empty)
```

So when ICAs render, `ICADocumentView` falls back to the empty signature line because no image URL was ever stored — the typed name and title alone don't draw a signature graphic.

### How this happened

In `ICABuilderModal.tsx` the "Save as default" flow saves whatever was in the canvas at that moment:
```ts
signature_url: carrierSigUrl,  // null if you didn't draw before clicking Save & Send
```
At some point a default was saved with the canvas blank → `signature_url` stored as `NULL` → every subsequent ICA reuses that empty default → image never rendered.

### The fix — three parts

**1. New "Carrier Signature Settings" panel (Management portal)**
A small dedicated UI to manage your default carrier block:
- Draw signature on a canvas (DPR-aware, same pattern as the operator signing canvas)
- Edit typed name + title
- Live preview of the saved signature image
- "Save default" button — uploads to `ica-signatures/carrier-default/...` and updates `carrier_signature_settings`
- "Clear signature" to start over

Location: Management → Settings → "Carrier Signature" card (adjacent to existing settings).

**2. Backfill the 23 existing ICAs**
Once you save a real signature default, a one-shot button "Apply to existing draft/sent ICAs" updates every `ica_contracts` row whose `carrier_signature_url IS NULL` to point at the new default URL. McMillan, Lockett, and the other 21 instantly show your signature in the ICA viewer, printout, and PDF.

(Fully-executed contracts are included by default since they're missing the carrier image; we'll show a confirmation listing each one before applying. You can uncheck any you want to leave alone.)

**3. Guardrail in the ICA builder**
Prevent this from happening again:
- If "Save as default" is checked but the canvas is empty AND there's no existing default image → block the save with a clear toast ("Draw your signature before saving as default").
- If sending an ICA with no carrier signature image (neither freshly drawn nor in defaults) → warning toast asking to draw one or load default.

### Files to touch

| File | Change |
|---|---|
| `src/components/ica/ICABuilderModal.tsx` | Add empty-signature guards on Save-as-default and Save-and-Send |
| `src/pages/management/ManagementPortal.tsx` (or settings sub-page) | Mount new `CarrierSignatureSettings` panel |
| `src/components/ica/CarrierSignatureSettings.tsx` *(new)* | Draw/save/clear default carrier signature + backfill action |
| No DB migration | `carrier_signature_settings` and `ica_contracts.carrier_signature_url` already exist |

### After deploying

1. Open Management → Carrier Signature settings
2. Draw your signature, confirm typed name "Marc Mueller" + title "Owner", click **Save default**
3. Click **Apply to existing ICAs** → all 23 contracts (including McMillan & Lockett) refresh with your signature
4. Reopen Johnathan McMillan's ICA → carrier signature image now renders in the viewer, print, and PDF

### Why this is safe
- No schema changes; uses existing tables and storage bucket (`ica-signatures`)
- Backfill only updates rows where `carrier_signature_url IS NULL` — won't overwrite anything
- RLS already restricts `carrier_signature_settings` writes to management/owner
- Builder guards are additive — no behavior change when a signature is already present

